import React from 'react';
import { FileText } from 'lucide-react';

interface DocumentSourceProps {
    source_document?: string | null;
    source_chunk_id?: string | null;
    className?: string;
}

/**
 * DocumentSource component displays a clickable document icon with source information
 * Matches the UI design from the screenshots with blue document icon
 */
export function DocumentSource({ source_document, source_chunk_id, className = '' }: DocumentSourceProps) {
    if (!source_document || source_document === 'Unknown') {
        return null;
    }

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const message = `Dokument: ${source_document}${source_chunk_id ? `\nAusschnitt ID: ${source_chunk_id}` : ''}`;
        alert(message);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer ${className}`}
            title={`Dokument: ${source_document}`}
        >
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">{source_document}</span>
        </button>
    );
}

interface DocumentSourceInlineProps {
    source_document?: string | null;
    source_chunk_id?: string | null;
}

/**
 * Inline document source badge (smaller, for inline use)
 */
export function DocumentSourceInline({ source_document, source_chunk_id }: DocumentSourceInlineProps) {
    if (!source_document || source_document === 'Unknown') {
        return null;
    }

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const message = `Dokument: ${source_document}${source_chunk_id ? `\nAusschnitt ID: ${source_chunk_id}` : ''}`;
        alert(message);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer"
            title={`Dokument: ${source_document}`}
        >
            <FileText className="h-2.5 w-2.5" />
            <span className="underline">{source_chunk_id || 'Info'}</span>
        </button>
    );
}
