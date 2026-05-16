mod apply;
mod document;
mod encoding;
mod mutation;
mod object;
mod render;

use document::{CanvasDocument, MutationFactory};
use mutation::{CreateObjectInput, TransformObjectInput};
use wasm_bindgen::prelude::*;

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

#[wasm_bindgen]
pub struct WasmCanvasRuntime {
    document: CanvasDocument,
    factory: MutationFactory,
}

#[wasm_bindgen]
impl WasmCanvasRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(document_id: String, actor_id: String) -> WasmCanvasRuntime {
        #[cfg(target_arch = "wasm32")]
        console_error_panic_hook::set_once();
        WasmCanvasRuntime {
            document: CanvasDocument::new(document_id.clone()),
            factory: MutationFactory::new(document_id, actor_id),
        }
    }

    pub fn apply_mutation_json(&mut self, json: String) -> Result<String, JsValue> {
        let mutation = encoding::mutation_from_json(&json).map_err(js_error)?;
        let result = self.document.apply_mutation(mutation);
        encoding::result_to_json(&result).map_err(js_error)
    }

    pub fn apply_mutation_binary(&mut self, bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
        let mutation = encoding::mutation_from_binary(bytes).map_err(js_error)?;
        let result = self.document.apply_mutation(mutation);
        encoding::result_to_binary(&result).map_err(js_error)
    }

    pub fn create_object_json(&mut self, json: String) -> Result<String, JsValue> {
        let input: CreateObjectInput =
            serde_json::from_str(&json).map_err(|err| js_error(err.to_string()))?;
        let lamport = self.document.next_lamport();
        let mutation = self.factory.create_object(input, lamport);
        let result = self.document.apply_mutation(mutation.clone());
        if !result.applied {
            return Err(js_error(result.message));
        }
        encoding::mutation_to_json(&mutation).map_err(js_error)
    }

    pub fn transform_object_json(&mut self, json: String) -> Result<String, JsValue> {
        let input: TransformObjectInput =
            serde_json::from_str(&json).map_err(|err| js_error(err.to_string()))?;
        let lamport = self.document.next_lamport();
        let mutation = self.factory.transform_object(input, lamport);
        let result = self.document.apply_mutation(mutation.clone());
        if !result.applied {
            return Err(js_error(result.message));
        }
        encoding::mutation_to_json(&mutation).map_err(js_error)
    }

    pub fn delete_object(&mut self, object_id: String) -> Result<String, JsValue> {
        let lamport = self.document.next_lamport();
        let mutation = self.factory.delete_object(object_id, lamport);
        let result = self.document.apply_mutation(mutation.clone());
        if !result.applied {
            return Err(js_error(result.message));
        }
        encoding::mutation_to_json(&mutation).map_err(js_error)
    }

    pub fn get_render_objects_json(&self) -> String {
        serde_json::to_string(&self.document.render_objects()).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_snapshot_binary(&self) -> Vec<u8> {
        encoding::document_to_binary(&self.document).unwrap_or_default()
    }

    pub fn load_snapshot_binary(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        let document = encoding::document_from_binary(bytes).map_err(js_error)?;
        if document.document_id != self.document.document_id {
            return Err(js_error("snapshot document_id does not match runtime"));
        }
        self.document = document;
        Ok(())
    }

    pub fn export_document_json(&self) -> String {
        serde_json::to_string_pretty(&self.document).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn encode_mutation_json_to_binary(&self, json: String) -> Result<Vec<u8>, JsValue> {
        let mutation = encoding::mutation_from_json(&json).map_err(js_error)?;
        encoding::mutation_to_binary(&mutation).map_err(js_error)
    }

    pub fn decode_mutation_binary_to_json(&self, bytes: &[u8]) -> Result<String, JsValue> {
        let mutation = encoding::mutation_from_binary(bytes).map_err(js_error)?;
        encoding::mutation_to_json(&mutation).map_err(js_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mutation::{CanvasMutation, MutationEventType, MutationPayload};
    use crate::object::{Geometry, PathPoint, Style, Transform};

    fn rect_input(object_id: &str) -> CreateObjectInput {
        CreateObjectInput {
            object_id: Some(object_id.to_string()),
            object_kind: Some("shape".to_string()),
            renderer_key: "core.rect".to_string(),
            transform: Transform::default(),
            geometry: Geometry::Rect {
                width: 100.0,
                height: 80.0,
            },
            style: Style::default(),
            metadata: None,
        }
    }

    #[test]
    fn object_created_applies_correctly() {
        let mut doc = CanvasDocument::new("doc");
        let factory = MutationFactory::new("doc", "actor-a");
        let mutation = factory.create_object(rect_input("rect-1"), 1);
        let result = doc.apply_mutation(mutation);
        assert!(result.applied);
        assert!(doc.objects.contains_key("rect-1"));
    }

    #[test]
    fn duplicate_event_id_is_ignored() {
        let mut doc = CanvasDocument::new("doc");
        let factory = MutationFactory::new("doc", "actor-a");
        let mutation = factory.create_object(rect_input("rect-1"), 1);
        let duplicate = mutation.clone();
        assert!(doc.apply_mutation(mutation).applied);
        let result = doc.apply_mutation(duplicate);
        assert!(!result.applied);
        assert!(result.duplicate);
        assert_eq!(doc.objects.len(), 1);
    }

    #[test]
    fn transform_applies_deterministically() {
        let mut doc = CanvasDocument::new("doc");
        let factory = MutationFactory::new("doc", "actor-a");
        doc.apply_mutation(factory.create_object(rect_input("rect-1"), 1));

        let low = CanvasMutation {
            event_id: "evt-low".to_string(),
            document_id: "doc".to_string(),
            actor_id: "actor-b".to_string(),
            lamport: 2,
            event_type: MutationEventType::ObjectTransformed,
            target_object_id: Some("rect-1".to_string()),
            payload: MutationPayload {
                transform: Some(Transform {
                    x: 10.0,
                    y: 0.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                }),
                ..MutationPayload::default()
            },
        };
        let high = CanvasMutation {
            event_id: "evt-high".to_string(),
            document_id: "doc".to_string(),
            actor_id: "actor-c".to_string(),
            lamport: 2,
            event_type: MutationEventType::ObjectTransformed,
            target_object_id: Some("rect-1".to_string()),
            payload: MutationPayload {
                transform: Some(Transform {
                    x: 20.0,
                    y: 0.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                }),
                ..MutationPayload::default()
            },
        };

        doc.apply_mutation(high);
        doc.apply_mutation(low);
        assert_eq!(doc.objects["rect-1"].transform.x, 20.0);
    }

    #[test]
    fn delete_tombstones_object() {
        let mut runtime = WasmCanvasRuntime::new("doc".to_string(), "actor-a".to_string());
        let json = serde_json::to_string(&rect_input("rect-1")).unwrap();
        runtime.create_object_json(json).unwrap();
        runtime.delete_object("rect-1".to_string()).unwrap();
        assert!(runtime.document.objects["rect-1"].is_deleted());
        assert_eq!(runtime.document.render_objects().len(), 0);
    }

    #[test]
    fn encode_decode_mutation_round_trip() {
        let factory = MutationFactory::new("doc", "actor-a");
        let mutation = factory.create_object(rect_input("rect-1"), 1);
        let binary = encoding::mutation_to_binary(&mutation).unwrap();
        let decoded = encoding::mutation_from_binary(&binary).unwrap();
        assert_eq!(mutation, decoded);
    }

    #[test]
    fn snapshot_load_round_trip() {
        let mut runtime = WasmCanvasRuntime::new("doc".to_string(), "actor-a".to_string());
        let json = serde_json::to_string(&CreateObjectInput {
            geometry: Geometry::Path {
                points: vec![PathPoint { x: 0.0, y: 0.0 }, PathPoint { x: 4.0, y: 2.0 }],
            },
            renderer_key: "core.path".to_string(),
            ..rect_input("path-1")
        })
        .unwrap();
        runtime.create_object_json(json).unwrap();
        let snapshot = runtime.get_snapshot_binary();

        let mut loaded = WasmCanvasRuntime::new("doc".to_string(), "actor-b".to_string());
        loaded.load_snapshot_binary(&snapshot).unwrap();
        assert_eq!(loaded.document, runtime.document);
    }
}
