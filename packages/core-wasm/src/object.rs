use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    pub scale_x: f64,
    pub scale_y: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum Geometry {
    Rect { width: f64, height: f64 },
    Ellipse { rx: f64, ry: f64 },
    Path { points: Vec<PathPoint> },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PathPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Style {
    pub fill: Option<String>,
    pub stroke: Option<String>,
    pub stroke_width: f64,
}

impl Default for Style {
    fn default() -> Self {
        Self {
            fill: Some("#7c3aed".to_string()),
            stroke: Some("#111827".to_string()),
            stroke_width: 2.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct EventStamp {
    pub lamport: u64,
    pub actor_id: String,
}

impl EventStamp {
    pub fn new(lamport: u64, actor_id: impl Into<String>) -> Self {
        Self {
            lamport,
            actor_id: actor_id.into(),
        }
    }
}

pub fn should_replace(current: &EventStamp, incoming: &EventStamp) -> bool {
    incoming.lamport > current.lamport
        || (incoming.lamport == current.lamport && incoming.actor_id > current.actor_id)
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ObjectVersions {
    pub object: EventStamp,
    pub transform: EventStamp,
    pub geometry: EventStamp,
    pub style: EventStamp,
    pub metadata: EventStamp,
    pub deleted: Option<EventStamp>,
}

impl ObjectVersions {
    pub fn new(stamp: EventStamp) -> Self {
        Self {
            object: stamp.clone(),
            transform: stamp.clone(),
            geometry: stamp.clone(),
            style: stamp.clone(),
            metadata: stamp,
            deleted: None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CanvasObject {
    pub object_id: String,
    pub object_kind: String,
    pub renderer_key: String,
    pub transform: Transform,
    pub geometry: Geometry,
    pub style: Style,
    pub metadata: Option<String>,
    pub versions: ObjectVersions,
}

impl CanvasObject {
    pub fn is_deleted(&self) -> bool {
        self.versions.deleted.is_some()
    }
}
