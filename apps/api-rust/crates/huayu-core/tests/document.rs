use huayu_core::{Document, DocumentPatch};
use serde_json::json;

#[test]
fn patch_sequence_is_optional_and_does_not_enter_the_document() {
    for sequence in [None, Some(2)] {
        let mut value = json!({
            "upsert": [{"id": "shape:one", "typeName": "shape", "props": {"text": "saved"}}],
            "remove": [],
            "client_id": "browser"
        });
        if let Some(sequence) = sequence {
            value["sequence"] = json!(sequence);
        }
        let patch: DocumentPatch = serde_json::from_value(value).unwrap();
        let encoded = serde_json::to_value(&patch).unwrap();
        assert_eq!(
            encoded.get("sequence"),
            sequence.map(|value| json!(value)).as_ref()
        );
        let mut document = Document::default();
        assert!(document.apply(&patch).unwrap());
        let saved = serde_json::to_value(document).unwrap();
        assert!(saved.get("sequence").is_none());
        assert_eq!(saved["store"]["shape:one"]["props"]["text"], "saved");
    }
}

#[test]
fn removing_and_restoring_a_record_does_not_change_the_document() {
    let record = json!({"id": "shape:one", "typeName": "shape", "props": {"text": "original"}});
    let mut document = Document {
        store: [("shape:one".to_owned(), record.clone())].into(),
        schema: json!({"version": 1}),
    };
    let original = document.clone();
    let patch = DocumentPatch {
        upsert: vec![record],
        remove: vec!["shape:one".to_owned()],
        ..DocumentPatch::default()
    };
    assert!(!document.apply(&patch).unwrap());
    assert!(document == original, "a no-op patch preserves the document");
}

#[test]
fn duplicate_upserts_compare_the_final_record_with_the_original() {
    let record = json!({"id": "shape:one", "typeName": "shape", "props": {"text": "original"}});
    let mut document = Document {
        store: [("shape:one".to_owned(), record.clone())].into(),
        ..Document::default()
    };
    let patch = DocumentPatch {
        upsert: vec![json!({"id": "shape:one", "typeName": "shape"}), record],
        ..DocumentPatch::default()
    };
    assert!(!document.apply(&patch).unwrap());
}

#[test]
fn exceeding_the_record_limit_leaves_the_document_unchanged() {
    let mut document = Document {
        store: (0..50_000)
            .map(|index| {
                let id = format!("shape:{index}");
                let record = json!({"id": id, "typeName": "shape"});
                (id, record)
            })
            .collect(),
        schema: json!({"version": 1}),
    };
    let original = document.clone();
    let patch = DocumentPatch {
        upsert: vec![
            json!({"id": "shape:extra-one", "typeName": "shape"}),
            json!({"id": "shape:extra-two", "typeName": "shape"}),
        ],
        remove: vec!["shape:0".to_owned()],
        schema: Some(json!({"version": 2})),
        ..DocumentPatch::default()
    };
    assert!(document.apply(&patch).is_err());
    assert!(
        document == original,
        "a rejected patch preserves every record and the schema"
    );
}

#[test]
fn preview_and_durable_patches_share_byte_limits_and_record_rules() {
    let valid_id = "图".repeat(85);
    let valid = DocumentPatch {
        client_id: "画".repeat(40),
        upsert: vec![json!({"id": valid_id, "typeName": "shape"})],
        ..Default::default()
    };
    assert!(valid.validate_preview().is_ok());
    assert!(Document::default().apply(&valid).unwrap());
    for invalid in [
        DocumentPatch {
            client_id: format!("{}a", valid.client_id),
            ..valid.clone()
        },
        DocumentPatch {
            upsert: vec![json!({"id": format!("{valid_id}a"), "typeName": "page"})],
            ..valid.clone()
        },
        DocumentPatch {
            upsert: vec![json!({"id": "state", "typeName": "instance"})],
            ..valid.clone()
        },
        DocumentPatch {
            remove: vec!["shape:old".into(); 50_000],
            ..valid
        },
    ] {
        assert!(invalid.validate_preview().is_err());
        assert!(Document::default().apply(&invalid).is_err());
    }
}

#[test]
fn durable_removals_tolerate_unrecognized_keys_while_live_previews_require_record_ids() {
    let patch = DocumentPatch {
        remove: vec![String::new()],
        ..Default::default()
    };
    assert!(!Document::default().apply(&patch).unwrap());
    assert!(patch.validate_preview().is_err());
}
