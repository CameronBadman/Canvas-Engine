use crate::document::CanvasDocument;
use crate::object::{Geometry, Style, Transform};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct RenderObject {
    pub object_id: String,
    pub object_kind: String,
    pub renderer_key: String,
    pub transform: Transform,
    pub geometry: Geometry,
    pub style: Style,
    pub metadata: Option<String>,
}

impl CanvasDocument {
    pub fn render_objects(&self) -> Vec<RenderObject> {
        let mut objects: Vec<_> = self
            .objects
            .values()
            .filter(|object| !object.is_deleted())
            .map(|object| RenderObject {
                object_id: object.object_id.clone(),
                object_kind: object.object_kind.clone(),
                renderer_key: object.renderer_key.clone(),
                transform: object.transform.clone(),
                geometry: object.geometry.clone(),
                style: object.style.clone(),
                metadata: object.metadata.clone(),
            })
            .collect();

        objects.sort_by(|a, b| a.object_id.cmp(&b.object_id));
        objects
    }
}
