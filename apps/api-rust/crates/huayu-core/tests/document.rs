use huayu_core::{Document, DocumentPatch};
use serde_json::json;

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
