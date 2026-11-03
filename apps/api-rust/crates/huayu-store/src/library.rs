use huayu_core::{AssetFolder, LibraryAsset, LibraryAssetDetails};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, TransactionTrait, sea_query::Expr,
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    Store, StoreError, StoreResult,
    entities::{asset, asset_folder, library_asset},
};

pub struct LibraryQuery<'a> {
    pub search: &'a str,
    pub folder_id: Option<&'a str>,
    pub unfiled: bool,
    pub trashed: bool,
    pub oldest: bool,
    pub offset: u64,
    pub limit: u64,
}

impl Store {
    pub async fn asset_folders(&self) -> StoreResult<Vec<AssetFolder>> {
        let rows = asset_folder::Entity::find()
            .order_by_asc(asset_folder::Column::Name)
            .all(&self.db)
            .await?;
        let counts: HashMap<String, u64> = library_asset::Entity::find()
            .select_only()
            .column(library_asset::Column::FolderId)
            .column_as(library_asset::Column::Id.count(), "asset_count")
            .filter(library_asset::Column::Trashed.eq(false))
            .group_by(library_asset::Column::FolderId)
            .into_tuple::<(Option<String>, i64)>()
            .all(&self.db)
            .await?
            .into_iter()
            // SQLite exposes COUNT as a signed integer; its value is nonnegative.
            .filter_map(|(folder_id, count)| folder_id.map(|id| (id, count.unsigned_abs())))
            .collect();
        Ok(rows
            .into_iter()
            .map(|row| AssetFolder {
                asset_count: counts.get(&row.id).copied().unwrap_or_default(),
                id: row.id,
                name: row.name,
                parent_id: row.parent_id,
            })
            .collect())
    }

    pub async fn create_asset_folder(
        &self,
        name: &str,
        parent_id: Option<String>,
    ) -> StoreResult<AssetFolder> {
        let name = huayu_core::validate_name(name)?.to_owned();
        if let Some(parent) = &parent_id {
            asset_folder::Entity::find_by_id(parent)
                .one(&self.db)
                .await?
                .ok_or(StoreError::NotFound)?;
        }
        let row = asset_folder::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(name),
            parent_id: Set(parent_id),
        }
        .insert(&self.db)
        .await?;
        Ok(AssetFolder {
            id: row.id,
            name: row.name,
            parent_id: row.parent_id,
            asset_count: 0,
        })
    }

    pub async fn rename_asset_folder(&self, id: &str, name: &str) -> StoreResult<()> {
        let name = huayu_core::validate_name(name)?.to_owned();
        let row = asset_folder::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let mut row = row.into_active_model();
        row.name = Set(name);
        row.update(&self.db).await?;
        Ok(())
    }

    /// Removing a folder keeps its images and child folders in the parent folder.
    pub async fn remove_asset_folder(&self, id: &str) -> StoreResult<()> {
        let transaction = self.db.begin().await?;
        let row = asset_folder::Entity::find_by_id(id)
            .one(&transaction)
            .await?
            .ok_or(StoreError::NotFound)?;
        library_asset::Entity::update_many()
            .col_expr(
                library_asset::Column::FolderId,
                Expr::value(row.parent_id.clone()),
            )
            .filter(library_asset::Column::FolderId.eq(id))
            .exec(&transaction)
            .await?;
        asset_folder::Entity::update_many()
            .col_expr(asset_folder::Column::ParentId, Expr::value(row.parent_id))
            .filter(asset_folder::Column::ParentId.eq(id))
            .exec(&transaction)
            .await?;
        asset_folder::Entity::delete_by_id(id)
            .exec(&transaction)
            .await?;
        transaction.commit().await?;
        Ok(())
    }

    pub async fn library_assets(
        &self,
        filters: LibraryQuery<'_>,
    ) -> StoreResult<(Vec<LibraryAsset>, u64)> {
        let mut query = library_asset::Entity::find()
            .filter(library_asset::Column::Trashed.eq(filters.trashed));
        if !filters.search.is_empty() {
            query = query.filter(library_asset::Column::Name.contains(filters.search));
        }
        if filters.unfiled {
            query = query.filter(library_asset::Column::FolderId.is_null());
        } else if let Some(folder_id) = filters.folder_id {
            query = query.filter(library_asset::Column::FolderId.eq(folder_id));
        }
        let total = query.clone().count(&self.db).await?;
        let query = if filters.oldest {
            query.order_by_asc(asset::Column::CreatedAt)
        } else {
            query.order_by_desc(asset::Column::CreatedAt)
        };
        let rows = query
            .order_by_asc(library_asset::Column::Id)
            .offset(filters.offset)
            .limit(filters.limit)
            .find_also_related(asset::Entity)
            .all(&self.db)
            .await?;
        let items = rows
            .into_iter()
            .map(library_asset_from_row)
            .collect::<StoreResult<Vec<_>>>()?;
        Ok((items, total))
    }

    pub async fn library_asset(&self, id: &str) -> StoreResult<LibraryAsset> {
        let row = library_asset::Entity::find_by_id(id)
            .find_also_related(asset::Entity)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        library_asset_from_row(row)
    }

    pub async fn add_library_asset(
        &self,
        asset_id: String,
        width: i32,
        height: i32,
        details: LibraryAssetDetails,
    ) -> StoreResult<()> {
        let name = huayu_core::validate_name(&details.name)?.to_owned();
        if let Some(folder_id) = &details.folder_id {
            asset_folder::Entity::find_by_id(folder_id)
                .one(&self.db)
                .await?
                .ok_or(StoreError::NotFound)?;
        }
        library_asset::ActiveModel {
            id: Set(asset_id),
            name: Set(name),
            width: Set(width),
            height: Set(height),
            folder_id: Set(details.folder_id),
            trashed: Set(false),
        }
        .insert(&self.db)
        .await?;
        Ok(())
    }

    /// Library removal is reversible and never removes bytes used by existing projects.
    pub async fn update_library_asset(
        &self,
        id: &str,
        details: LibraryAssetDetails,
    ) -> StoreResult<()> {
        let name = huayu_core::validate_name(&details.name)?.to_owned();
        if let Some(folder_id) = &details.folder_id {
            asset_folder::Entity::find_by_id(folder_id)
                .one(&self.db)
                .await?
                .ok_or(StoreError::NotFound)?;
        }
        let row = library_asset::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let mut row = row.into_active_model();
        row.name = Set(name);
        row.folder_id = Set(details.folder_id);
        row.trashed = Set(details.trashed);
        row.update(&self.db).await?;
        Ok(())
    }
}

fn library_asset_from_row(
    (row, file): (library_asset::Model, Option<asset::Model>),
) -> StoreResult<LibraryAsset> {
    let file = file.ok_or(StoreError::NotFound)?;
    Ok(LibraryAsset {
        id: row.id,
        name: row.name,
        mime: file.mime,
        size: file.size,
        width: row.width,
        height: row.height,
        folder_id: row.folder_id,
        trashed: row.trashed,
        created_at: file.created_at,
    })
}
