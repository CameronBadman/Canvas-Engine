use crate::object::{CanvasObject, Geometry, Style, Transform};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CanvasMutation {
    pub event_id: String,
    pub document_id: String,
    pub actor_id: String,
    pub lamport: u64,
    pub event_type: MutationEventType,
    pub target_object_id: Option<String>,
    pub payload: MutationPayload,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum MutationEventType {
    #[serde(rename = "object.created")]
    ObjectCreated,
    #[serde(rename = "object.updated")]
    ObjectUpdated,
    #[serde(rename = "object.deleted")]
    ObjectDeleted,
    #[serde(rename = "object.transformed")]
    ObjectTransformed,
    #[serde(rename = "document.cleared")]
    DocumentCleared,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct MutationPayload {
    pub object: Option<CanvasObject>,
    pub object_kind: Option<String>,
    pub renderer_key: Option<String>,
    pub geometry: Option<Geometry>,
    pub style: Option<Style>,
    pub metadata: Option<String>,
    pub transform: Option<Transform>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CreateObjectInput {
    pub object_id: Option<String>,
    pub object_kind: Option<String>,
    pub renderer_key: String,
    #[serde(default)]
    pub transform: Transform,
    pub geometry: Geometry,
    #[serde(default)]
    pub style: Style,
    pub metadata: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct TransformObjectInput {
    pub object_id: String,
    pub transform: Transform,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ApplyResult {
    pub applied: bool,
    pub duplicate: bool,
    pub document_id: String,
    pub event_id: Option<String>,
    pub lamport_clock: u64,
    pub target_object_id: Option<String>,
    pub message: String,
}
