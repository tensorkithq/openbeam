use openbeam_detection::DetectionSource;

pub(super) fn format_verse_ref(book_name: &str, chapter: i32, verse: i32, verse_end: Option<i32>) -> String {
    match verse_end {
        Some(end) if end != verse => format!("{book_name} {chapter}:{verse}-{end}"),
        _ => format!("{book_name} {chapter}:{verse}"),
    }
}

pub(super) fn source_label(source: &DetectionSource) -> String {
    match source {
        DetectionSource::DirectReference => "direct".to_string(),
        DetectionSource::Contextual => "contextual".to_string(),
        DetectionSource::QuotationMatch { .. } => "quotation".to_string(),
        DetectionSource::SemanticLocal { .. } => "semantic_local".to_string(),
        DetectionSource::SemanticCloud { .. } => "semantic_cloud".to_string(),
        other => format!("{other:?}"),
    }
}
