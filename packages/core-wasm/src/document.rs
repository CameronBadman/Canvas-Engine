use crate::mutation::{
    CanvasMutation, CreateObjectInput, MutationEventType, MutationPayload, TransformObjectInput,
};
use crate::object::{CanvasObject, EventStamp, ObjectVersions};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CanvasDocument {
    pub document_id: String,
    pub objects: HashMap<String, CanvasObject>,
    pub applied_events: HashSet<String>,
    pub lamport_clock: u64,
}

impl CanvasDocument {
    pub fn new(document_id: impl Into<String>) -> Self {
        Self {
            document_id: document_id.into(),
            objects: HashMap::new(),
            applied_events: HashSet::new(),
            lamport_clock: 0,
        }
    }

    pub fn next_lamport(&mut self) -> u64 {
        self.lamport_clock += 1;
        self.lamport_clock
    }
}

#[derive(Clone, Debug)]
pub struct MutationFactory {
    pub document_id: String,
    pub actor_id: String,
}

impl MutationFactory {
    pub fn new(document_id: impl Into<String>, actor_id: impl Into<String>) -> Self {
        Self {
            document_id: document_id.into(),
            actor_id: actor_id.into(),
        }
    }

    pub fn create_object(&self, input: CreateObjectInput, lamport: u64) -> CanvasMutation {
        let object_id = input
            .object_id
            .unwrap_or_else(|| format!("{}:object:{}", self.actor_id, lamport));
        let stamp = EventStamp::new(lamport, self.actor_id.clone());
        let object = CanvasObject {
            object_id: object_id.clone(),
            object_kind: input.object_kind.unwrap_or_else(|| "shape".to_string()),
            renderer_key: input.renderer_key,
            transform: input.transform,
            geometry: input.geometry,
            style: input.style,
            metadata: input.metadata,
            versions: ObjectVersions::new(stamp),
        };

        CanvasMutation {
            event_id: format!("{}:event:{}:object.created", self.actor_id, lamport),
            document_id: self.document_id.clone(),
            actor_id: self.actor_id.clone(),
            lamport,
            event_type: MutationEventType::ObjectCreated,
            target_object_id: Some(object_id),
            payload: MutationPayload {
                object: Some(object),
                ..MutationPayload::default()
            },
        }
    }

    pub fn transform_object(&self, input: TransformObjectInput, lamport: u64) -> CanvasMutation {
        CanvasMutation {
            event_id: format!("{}:event:{}:object.transformed", self.actor_id, lamport),
            document_id: self.document_id.clone(),
            actor_id: self.actor_id.clone(),
            lamport,
            event_type: MutationEventType::ObjectTransformed,
            target_object_id: Some(input.object_id),
            payload: MutationPayload {
                transform: Some(input.transform),
                ..MutationPayload::default()
            },
        }
    }

    pub fn delete_object(&self, object_id: String, lamport: u64) -> CanvasMutation {
        CanvasMutation {
            event_id: format!("{}:event:{}:object.deleted", self.actor_id, lamport),
            document_id: self.document_id.clone(),
            actor_id: self.actor_id.clone(),
            lamport,
            event_type: MutationEventType::ObjectDeleted,
            target_object_id: Some(object_id),
            payload: MutationPayload::default(),
        }
    }
}
