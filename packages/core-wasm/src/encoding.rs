use crate::document::CanvasDocument;
use crate::mutation::{ApplyResult, CanvasMutation};

pub fn mutation_from_json(json: &str) -> Result<CanvasMutation, String> {
    serde_json::from_str(json).map_err(|err| err.to_string())
}

pub fn mutation_to_json(mutation: &CanvasMutation) -> Result<String, String> {
    serde_json::to_string(mutation).map_err(|err| err.to_string())
}

pub fn result_to_json(result: &ApplyResult) -> Result<String, String> {
    serde_json::to_string(result).map_err(|err| err.to_string())
}

pub fn mutation_from_binary(bytes: &[u8]) -> Result<CanvasMutation, String> {
    bincode::deserialize(bytes).map_err(|err| err.to_string())
}

pub fn mutation_to_binary(mutation: &CanvasMutation) -> Result<Vec<u8>, String> {
    bincode::serialize(mutation).map_err(|err| err.to_string())
}

pub fn result_to_binary(result: &ApplyResult) -> Result<Vec<u8>, String> {
    bincode::serialize(result).map_err(|err| err.to_string())
}

pub fn document_to_binary(document: &CanvasDocument) -> Result<Vec<u8>, String> {
    bincode::serialize(document).map_err(|err| err.to_string())
}

pub fn document_from_binary(bytes: &[u8]) -> Result<CanvasDocument, String> {
    bincode::deserialize(bytes).map_err(|err| err.to_string())
}
