use crate::document::CanvasDocument;
use crate::mutation::{ApplyResult, CanvasMutation, MutationEventType};
use crate::object::{should_replace, EventStamp, Geometry};

impl CanvasDocument {
    pub fn apply_mutation(&mut self, mutation: CanvasMutation) -> ApplyResult {
        if mutation.document_id != self.document_id {
            return self.result(
                false,
                false,
                Some(mutation.event_id),
                mutation.target_object_id,
                "ignored mutation for a different document",
            );
        }

        if self.applied_events.contains(&mutation.event_id) {
            return self.result(
                false,
                true,
                Some(mutation.event_id),
                mutation.target_object_id,
                "duplicate event ignored",
            );
        }

        self.lamport_clock = self.lamport_clock.max(mutation.lamport);
        let stamp = EventStamp::new(mutation.lamport, mutation.actor_id.clone());
        let event_id = mutation.event_id.clone();
        let target_object_id = mutation.target_object_id.clone();
        let message = match mutation.event_type {
            MutationEventType::ObjectCreated => {
                let Some(object) = mutation.payload.object else {
                    return self.result(
                        false,
                        false,
                        Some(event_id),
                        target_object_id,
                        "object.created missing payload.object",
                    );
                };
                let object_id = object.object_id.clone();
                match self.objects.get(&object_id) {
                    Some(existing) if !should_replace(&existing.versions.object, &stamp) => {
                        "create ignored by LWW object version".to_string()
                    }
                    _ => {
                        self.objects.insert(object_id, object);
                        "object created".to_string()
                    }
                }
            }
            MutationEventType::ObjectUpdated => match target_object_id.as_deref() {
                Some(object_id) => match self.objects.get_mut(object_id) {
                    Some(object) => {
                        if let Some(object_kind) = mutation.payload.object_kind {
                            if should_replace(&object.versions.object, &stamp) {
                                object.object_kind = object_kind;
                                object.versions.object = stamp.clone();
                            }
                        }
                        if let Some(renderer_key) = mutation.payload.renderer_key {
                            if should_replace(&object.versions.object, &stamp) {
                                object.renderer_key = renderer_key;
                                object.versions.object = stamp.clone();
                            }
                        }
                        if let Some(geometry) = mutation.payload.geometry {
                            if matches!(object.geometry, Geometry::Path { .. }) {
                                return self.result(
                                    false,
                                    false,
                                    Some(event_id),
                                    target_object_id,
                                    "path geometry is immutable",
                                );
                            }
                            if should_replace(&object.versions.geometry, &stamp) {
                                object.geometry = geometry;
                                object.versions.geometry = stamp.clone();
                            }
                        }
                        if let Some(style) = mutation.payload.style {
                            if should_replace(&object.versions.style, &stamp) {
                                object.style = style;
                                object.versions.style = stamp.clone();
                            }
                        }
                        if let Some(metadata) = mutation.payload.metadata {
                            if should_replace(&object.versions.metadata, &stamp) {
                                object.metadata = Some(metadata);
                                object.versions.metadata = stamp.clone();
                            }
                        }
                        "object updated".to_string()
                    }
                    None => "target object missing".to_string(),
                },
                None => "object.updated missing target_object_id".to_string(),
            },
            MutationEventType::ObjectDeleted => match target_object_id.as_deref() {
                Some(object_id) => match self.objects.get_mut(object_id) {
                    Some(object) => {
                        let replace = object
                            .versions
                            .deleted
                            .as_ref()
                            .map(|current| should_replace(current, &stamp))
                            .unwrap_or(true);
                        if replace {
                            object.versions.deleted = Some(stamp);
                        }
                        "object tombstoned".to_string()
                    }
                    None => "target object missing".to_string(),
                },
                None => "object.deleted missing target_object_id".to_string(),
            },
            MutationEventType::ObjectTransformed => match target_object_id.as_deref() {
                Some(object_id) => match self.objects.get_mut(object_id) {
                    Some(object) => {
                        let Some(transform) = mutation.payload.transform else {
                            return self.result(
                                false,
                                false,
                                Some(event_id),
                                target_object_id,
                                "object.transformed missing payload.transform",
                            );
                        };
                        if should_replace(&object.versions.transform, &stamp) {
                            object.transform = transform;
                            object.versions.transform = stamp;
                        }
                        "object transformed".to_string()
                    }
                    None => "target object missing".to_string(),
                },
                None => "object.transformed missing target_object_id".to_string(),
            },
            MutationEventType::DocumentCleared => {
                for object in self.objects.values_mut() {
                    let replace = object
                        .versions
                        .deleted
                        .as_ref()
                        .map(|current| should_replace(current, &stamp))
                        .unwrap_or(true);
                    if replace {
                        object.versions.deleted = Some(stamp.clone());
                    }
                }
                "document cleared".to_string()
            }
        };

        self.applied_events.insert(event_id.clone());
        self.result(true, false, Some(event_id), target_object_id, message)
    }

    fn result(
        &self,
        applied: bool,
        duplicate: bool,
        event_id: Option<String>,
        target_object_id: Option<String>,
        message: impl Into<String>,
    ) -> ApplyResult {
        ApplyResult {
            applied,
            duplicate,
            document_id: self.document_id.clone(),
            event_id,
            lamport_clock: self.lamport_clock,
            target_object_id,
            message: message.into(),
        }
    }
}
