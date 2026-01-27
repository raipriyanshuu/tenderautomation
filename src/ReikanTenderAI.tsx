import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  AlertTriangle,
  FileText,
  Search,
  Upload,
  ChevronRight,
  Wand2,
  Plus,
  Trash2,
  Info,
  ArrowRight,
  Truck,
  Recycle,
  Fuel,
  MapPin,
  Link as LinkIcon,
  SlidersHorizontal,
  Download,
  Save,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { dbService } from "@/lib/db-service";
import { CalculationDetails } from "@/components/CalculationDetails";
import { FileUploadZone } from "@/components/FileUploadZone";
import { PriceValidation } from "@/components/PriceValidation";
import { DocumentSource, DocumentSourceInline } from "@/components/DocumentSource";
import { LVPosition } from "@/lib/price-validation-service";

// ---------------- Types
interface SourceInfo {
  text: string;
  source_document: string;
  source_chunk_id?: string | null;
  page_number?: number | null;
  detail?: string;
}

interface Tender {
  id: string;
  runId?: string;
  tenderId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  title: string;
  buyer: string;
  region: string;
  deadline: string | null; // ISO date or null if missing
  url: string;
  score: number; // overall match score 0..100
  legalRisks: string[];
  legalRisksWithSource?: SourceInfo[];
  mustHits: number;
  mustTotal: number;
  mustHitPercent?: number; // NEW: Calculated percentage
  canHits: number;
  canTotal: number;
  possibleHitPercent?: number; // NEW: Calculated percentage
  logisticsScore?: number; // NEW: Logistics feasibility score
  serviceTypes: string[]; // e.g., Unterhaltsreinigung, Glasreinigung
  scopeOfWork?: string;
  scopeOfWorkSource?: SourceInfo; // NEW: Source tracking for scope
  certifications?: string[];
  evaluationCriteria?: string[];
  evaluationCriteriaWithSource?: SourceInfo[]; // NEW: Source tracking
  safety?: string[];
  penalties?: string[];
  submission?: string[]; // Top mandatory requirements (from mandatory_requirements[])
  submissionWithSource?: SourceInfo[]; // NEW: Source tracking
  processSteps?: Array<{ // Timeline/process steps (from process_steps[])
    step: number;
    days_de?: string;
    title_de?: string;
    description_de?: string;
    source_document?: string; // NEW: Source tracking
    source_chunk_id?: string | null;
  }>;
  projectDuration?: string | null;  // Timeline project duration (e.g., "24 Monate")
  economicAnalysis?: { // Economic analysis (from economic_analysis)
    potentialMargin?: { text: string | null; source_document: string | null } | string | null;
    orderValueEstimated?: { text: string | null; source_document: string | null } | string | null;
    competitiveIntensity?: { text: string | null; source_document: string | null } | string | null;
    logisticsCosts?: { text: string | null; source_document: string | null } | string | null;
    contractRisk?: { text: string | null; source_document: string | null } | string | null;
    criticalSuccessFactors?: string[];
  };
  missingEvidence?: any[]; // Missing evidence documents (from missing_evidence_documents[])
  missingEvidenceWithSource?: SourceInfo[]; // NEW: Source tracking
  sources?: {
    title?: string;
    buyer?: string;
    mustCriteria?: string;
    logistics?: string;
    deadline?: string;
    certifications?: string;
    scopeOfWork?: string;
    pricingModel?: string;
    penalties?: string;
    evaluationCriteria?: string;
    submission?: string;
    legalRisks?: string;
  };
}

interface BatchSummary {
  run_id: string;
  ui_json: Record<string, any>;
  total_files: number;
  success_files: number;
  failed_files: number;
  status: string;
}

interface BatchFile {
  doc_id: string;
  filename: string;
  file_type?: string | null;
  status: string;
  extracted_json?: Record<string, any> | null;
  error?: string | null;
  error_type?: string | null;
  processing_duration_ms?: number | null;
}

interface BatchSummaryPayload {
  batchId: string;
  summary: BatchSummary;
  files?: BatchFile[];
}

interface CompanyProfile {
  name: string;
  address: string;
  vatId: string;
  permits: string[];
  fleet: string;
  insurance: string;
  contactName: string;
  contactEmail: string;
  depotPostcode?: string;
  certifications?: string; // ISO, quality standards
}

interface DocItem {
  id: string;
  name: string;
  status: "present" | "missing" | "needs_update";
  notes?: string;
}

interface PricingInput {
  projectDurationDays: number; // total project duration
  equipmentDailyRate: number; // € equipment daily rental rate
  deliveryDistance: number; // depot → site one-way km
  setupCost: number; // € one-time setup/installation
  operatorDailyRate: number; // € daily operator cost (if required)
  fuelCostPerDay: number; // € fuel/energy per day
  maintenanceCostPerDay: number; // € daily maintenance
  insurancePerDay: number; // € damage waiver & insurance per day
  transportCostPerKm: number; // € cost per km
  marginPct: number; // % profit margin
}

// ---------------- Ergänzungsfragen für Baugeräte-Ausschreibungen
// Diese Fragen müssen beantwortet werden, wenn Stammdaten nicht ausreichen
const REQUIRED_Q: { id: string; label: string; hint?: string }[] = [
  { id: "experience", label: "Wie viele Jahre Erfahrung hat abc in der Baustelleneinrichtung und Gerätebereitstellung für vergleichbare Projekte?", hint: "Bitte geben Sie spezifische Erfahrungen und Referenzprojekte im Baubereich an" },
  { id: "fleetCapacity", label: "Welche Baugeräte und Maschinen können Sie für dieses Projekt bereitstellen?", hint: "Detaillierte Auflistung verfügbarer Geräte mit BGL-Codes, Anzahl, Alter, Wartungszustand" },
  { id: "equipmentTypes", label: "Welche spezifischen Gerätekategorien decken Sie ab?", hint: "Erdbaugeräte, Hebezeuge, Baustelleneinrichtung, Stromversorgung, Gerüste, etc." },
  { id: "logistics", label: "Wie organisieren Sie die Logistik für Anlieferung, Wartung und Rückholung?", hint: "Lieferzeiten, Notfall-Ersatzgeräte, Austauschprozesse, Standortnähe" },
  { id: "operators", label: "Können Sie qualifizierte Maschinenführer und Bedienpersonal bereitstellen?", hint: "Verfügbarkeit, Qualifikationen, Zertifizierungen (z.B. Kranführerschein, Baggerführerschein)" },
  { id: "maintenance", label: "Wie ist Ihr Wartungs- und Instandhaltungskonzept organisiert?", hint: "DGUV-Prüfungen, UVV-Prüfungen, Wartungsintervalle, 24/7-Service" },
  { id: "safety", label: "Welche Arbeitssicherheits- und DGUV-Standards erfüllen Ihre Geräte?", hint: "CE-Kennzeichnung, DGUV Vorschrift 52, Betriebsanleitungen, Sicherheitseinweisungen" },
  { id: "emergency", label: "Wie schnell können Sie Ersatzgeräte bei Ausfall bereitstellen?", hint: "Reaktionszeiten, Ersatzgerätepool, Notfallkonzept, 24/7 Erreichbarkeit" },
];

const PLACEHOLDERS = new Set([
  "unbekannt",
  "unknown",
  "tbd",
  "n/a",
  "nicht vorhanden",
  "keine angabe",
  "unspecified",
  "...",
  "null",
  "none",
  "k.a.",
]);

const normalizeText = (text: string) =>
  text.toLowerCase().trim().replace(/\s+/g, " ");

const isPlaceholder = (text?: string | null) => {
  if (!text) return true;
  const normalized = normalizeText(text);
  return normalized.length < 3 || PLACEHOLDERS.has(normalized);
};

const mergeSourceDocuments = (a?: string, b?: string) => {
  const parts = new Set(
    [a, b]
      .filter(Boolean)
      .map((value) => (value || "").trim())
      .filter((value) => value.length > 0)
  );
  return Array.from(parts).join("; ");
};

const pickTopRisks = (risks: any[], metaSource?: string) => {
  const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const deduped = new Map<string, { text: string; source_document: string; source_chunk_id?: string | null; severity: string; index: number }>();

  risks.forEach((risk: any, index: number) => {
    const text = (risk?.risk_de || risk?.text || "").trim();
    const severity = (risk?.severity || "").toString().toLowerCase();
    if (!text || isPlaceholder(text) || !severity) return;
    const key = normalizeText(text);
    if (!key) return;
    const source_document = risk?.source_document || metaSource || "";
    const source_chunk_id = risk?.source_chunk_id ?? null;
    if (deduped.has(key)) {
      const existing = deduped.get(key)!;
      // Create a new object instead of mutating
      deduped.set(key, {
        ...existing,
        source_document: mergeSourceDocuments(existing.source_document, source_document)
      });
      return;
    }
    deduped.set(key, { text, source_document, source_chunk_id, severity, index });
  });

  return Array.from(deduped.values())
    .sort((a, b) => {
      const aRank = severityRank[a.severity] || 1;
      const bRank = severityRank[b.severity] || 1;
      return bRank - aRank || a.index - b.index;
    })
    .slice(0, 5)
    .map(({ text, source_document, source_chunk_id }) => ({
      text,
      source_document,
      source_chunk_id,
    }));
};

const pickTopRequirements = (requirements: any[], metaSource?: string) => {
  const primarySource = (metaSource || "").trim();
  const ordered = requirements
    .map((req: any, index: number) => {
      const text = (req?.requirement_de || req?.text || "").trim();
      const detail = (req?.explanation_de || req?.explanation || req?.description_de || "").trim();
      return {
        text,
        detail,
        source_document: req?.source_document || "",
        source_chunk_id: req?.source_chunk_id ?? null,
        index,
      };
    })
    .filter((req: any) => req.text && !isPlaceholder(req.text))
    .sort((a: any, b: any) => {
      const aPrimary = a.source_document === primarySource ? 0 : 1;
      const bPrimary = b.source_document === primarySource ? 0 : 1;
      return aPrimary - bPrimary || a.index - b.index;
    });

  const seen = new Set<string>();
  const result: SourceInfo[] = [];
  for (const req of ordered) {
    const key = normalizeText(req.text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      text: req.text,
      detail: req.detail || undefined,
      source_document: req.source_document || primarySource || "",
      source_chunk_id: req.source_chunk_id,
    });
    if (result.length >= 5) break;
  }
  return result;
};

const pickTopCriteria = (criteria: any[], metaSource?: string) => {
  const seen = new Map<string, { text: string; weight: number; source_document: string; source_chunk_id?: string | null }>();
  criteria.forEach((crit: any) => {
    const text = (crit?.criterion_de || crit?.text || "").trim();
    if (!text || isPlaceholder(text)) return;
    const weight = Number(crit?.weight_percent ?? 0);
    if (Number.isFinite(weight) && weight === 0) return;
    const key = normalizeText(text);
    const source_document = crit?.source_document || metaSource || "";
    const source_chunk_id = crit?.source_chunk_id ?? null;
    if (!seen.has(key)) {
      seen.set(key, { text, weight, source_document, source_chunk_id });
      return;
    }
    const existing = seen.get(key)!;
    if (weight > existing.weight) {
      seen.set(key, { text, weight, source_document, source_chunk_id });
    } else {
      // Create a new object instead of mutating
      seen.set(key, {
        ...existing,
        source_document: mergeSourceDocuments(existing.source_document, source_document)
      });
    }
  });

  return Array.from(seen.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((item) => ({
      text: item.weight ? `${item.text} (${item.weight}%)` : item.text,
      source_document: item.source_document,
      source_chunk_id: item.source_chunk_id,
    }));
};

const pickTopStrings = (items: any[], limit = 5) => {
  const deduped = new Map<string, string>();
  items.forEach((item: any) => {
    const text = (typeof item === "string" ? item : item?.text || "").trim();
    if (!text || isPlaceholder(text)) return;
    const key = normalizeText(text);
    if (!deduped.has(key)) {
      deduped.set(key, text);
    }
  });
  return Array.from(deduped.values()).slice(0, limit);
};

const getEconomicText = (value: any) => {
  const text = typeof value === "object" ? value?.text : value;
  if (!text || isPlaceholder(String(text))) return "";
  return String(text);
};

const buildTimelineSteps = (steps: any[], timeline: any, metaSource?: string) => {
  const normalized = (value: string) => normalizeText(value);
  const validSteps = steps
    .map((step: any, index: number) => ({
      title_de: (step?.title_de || "").trim(),
      description_de: (step?.description_de || "").trim(),
      days_de: (step?.days_de || "").trim(),
      source_document: step?.source_document || metaSource || "",
      source_chunk_id: step?.source_chunk_id ?? null,
      index,
    }))
    .filter((step: any) => step.title_de && !isPlaceholder(step.title_de));

  const buckets = [
    { key: "preparation", label: "Vorbereitung", keywords: ["vorbereitung", "planung", "beschaffung", "bereitstellung"] },
    { key: "review", label: "Interne Freigabe/Review", keywords: ["freigabe", "review", "prüfung", "genehmigung"] },
    { key: "submission", label: "Angebotsabgabe", keywords: ["abgabe", "einreich", "submission", "angebot"] },
    { key: "clarifications", label: "Nachforderungen", keywords: ["nachforderung", "klärung", "rückfrage", "clarification"] },
    { key: "award", label: "Zuschlag", keywords: ["zuschlag", "vergabeentscheidung", "entscheidung", "award"] },
    { key: "execution", label: "Leistungsbeginn", keywords: ["leistungsbeginn", "ausführung", "beginn", "start"] },
  ];

  const bucketed: Record<string, any> = {};

  validSteps.forEach((step: any) => {
    const haystack = normalized(`${step.title_de} ${step.description_de}`);
    const bucket = buckets.find((b) => b.keywords.some((keyword) => haystack.includes(keyword)));
    if (!bucket) return;
    if (!bucketed[bucket.key]) {
      bucketed[bucket.key] = step;
    }
  });

  if (!bucketed.submission && timeline?.submission_deadline_de) {
    bucketed.submission = {
      title_de: "Angebotsabgabe",
      description_de: `Abgabefrist: ${timeline.submission_deadline_de}`,
      days_de: "",
      source_document: timeline.source_document || metaSource || "",
      source_chunk_id: null,
      index: Number.MAX_SAFE_INTEGER,
    };
  }

  return buckets
    .map((bucket) => bucketed[bucket.key])
    .filter(Boolean)
    .slice(0, 6)
    .map((step: any, idx: number) => ({
      step: idx + 1,
      title_de: step.title_de,
      description_de: step.description_de,
      days_de: step.days_de,
      source_document: step.source_document,
      source_chunk_id: step.source_chunk_id,
    }));
};

// ---------------- Mock data (Construction Equipment Rental - Germany)
const MOCK_TENDERS: Tender[] = [
  {
    id: "t-ce-501",
    title: "Baustelleneinrichtung Infrastrukturprojekt A7 Hamburg-Harburg (150 Tage)",
    buyer: "DEGES Deutsche Einheit Fernstraßenplanungs- und -bau GmbH",
    region: "DE-HH",
    deadline: "2025-12-15",
    url: "https://example.com/tenders/ce-501",
    score: 91,
    legalRisks: [
      "VOB/C DIN 18299: Baustelleneinrichtung muss gemäß EFB-Preis 221-223 kalkuliert werden",
      "DGUV Vorschrift 52/70/52: Alle Baugeräte müssen UVV-geprüft sein (aktuelle Prüfplaketten)",
      "Vertragsstrafen: Bei verspäteter Anlieferung bis 5% des Tageswertes pro Tag",
      "Haftung: Betriebshaftpflicht mind. 10 Mio. € für Baugeräte-/Personenschäden erforderlich",
      "BGL 2020 Konformität: Gerätekalkulation nach aktueller Baugeräteliste"
    ],
    mustHits: 9,
    mustTotal: 10,
    canHits: 14,
    canTotal: 16,
    serviceTypes: ["Baustelleneinrichtung", "Erdbau", "Gerüstbau"],
    scopeOfWork: "Bereitstellung und Betrieb der Baustelleneinrichtung inkl. Erdbaugeräte, Hebezeuge, Stromversorgung und Gerüste für Infrastrukturprojekt A7 über 150 Tage",
    certifications: ["ISO 9001", "DGUV Vorschrift 52"],
    evaluationCriteria: ["Preis 60%", "Qualität 25%", "Nachhaltigkeit 15%"],
    safety: ["UVV-Prüfung", "CE-Kennzeichnung", "Betriebsanleitungen"],
    penalties: ["Verspätete Anlieferung: bis 5% Tageswert/Tag", "Geräteausfall ohne Ersatz: 3% Auftragswert"],
    submission: ["Handelsregisterauszug", "Betriebshaftpflicht mind. 10 Mio. €", "DGUV-Nachweise", "Referenzen Infrastrukturprojekte", "BGL-konforme Kalkulation"],
    sources: {
      mustCriteria: "Vergabeunterlagen Abschnitt 2.1, S. 8-12",
      logistics: "Projektbeschreibung S. 15",
      deadline: "Bekanntmachung S. 1",
      certifications: "Technische Spezifikationen S. 22-24",
      scopeOfWork: "Leistungsverzeichnis S. 30-45",
      pricingModel: "Vertragsbedingungen Anlage 3, S. 67",
      penalties: "Vertragsbedingungen § 11, S. 52",
      evaluationCriteria: "Vergabebeschreibung S. 25",
      submission: "Bewerbungsunterlagen Checkliste S. 5",
      legalRisks: "VOB/C Anforderungen S. 18-21, DGUV Prüfpflichten S. 24"
    }
  },
  {
    id: "t-ce-502",
    title: "Rahmenvertrag Baumaschinen & Gerüste – Stadt Bremen (24 Monate)",
    buyer: "Eigenbetrieb der Stadtgemeinde Bremen",
    region: "DE-HB",
    deadline: "2026-01-20",
    url: "https://example.com/tenders/ce-502",
    score: 88,
    legalRisks: [
      "Rahmenvertrag: Festpreise für Gerätekategorien über 24 Monate mit Preisgleitklausel",
      "Verfügbarkeit: Garantierte Lieferzeiten (24h für Standardgeräte, 48h für Spezialgeräte)",
      "Wartung: Monatliche DGUV-Prüfberichte für alle vermieteten Geräte erforderlich",
      "Ersatzgeräte: Bei Ausfall muss binnen 4h Ersatz gestellt werden",
      "Standortnähe: Depot max. 50 km von Bremen Stadtzentrum"
    ],
    mustHits: 8,
    mustTotal: 10,
    canHits: 11,
    canTotal: 15,
    serviceTypes: ["Rahmenvertrag", "Baumaschinen", "Gerüste", "Stromerzeuger"],
    scopeOfWork: "Rahmenvertrag über 24 Monate zur Bereitstellung von Baumaschinen, Gerüsten und Stromerzeugern für städtische Bauprojekte mit garantierten Lieferzeiten",
    certifications: ["ISO 9001", "SCC"],
    evaluationCriteria: ["Preis 50%", "Verfügbarkeit 30%", "Servicequalität 20%"],
    safety: ["DGUV-Prüfberichte monatlich", "Ersatzgeräte-Garantie 4h"],
    penalties: ["Lieferverzug: 2% Tageswert/Tag", "Fehlende Ersatzgeräte: 5% Monatswert"],
    submission: ["Gewerbeschein", "Betriebshaftpflicht", "Referenzliste Rahmenverträge", "Standortnachweis max. 50km Bremen"],
  },
  {
    id: "t-ce-503",
    title: "Baugeräte für Neubau Logistikzentrum Hannover (180 Tage)",
    buyer: "DHL Supply Chain GmbH",
    region: "DE-NI",
    deadline: "2025-12-22",
    url: "https://example.com/tenders/ce-503",
    score: 86,
    legalRisks: [
      "Projektphasen: Unterschiedliche Geräte für Rohbau, Ausbau, Außenanlagen (flexible Tausch-Logistik)",
      "CE-Kennzeichnung: Alle Maschinen müssen CE-konform sein mit deutscher Betriebsanleitung",
      "Bedienpersonal: Optional Maschinenführer mit Kranschein, Baggerführerschein, Staplerführerschein",
      "Versicherung: All-Risk-Versicherung inkl. Diebstahl, Vandalismus, höhere Gewalt",
      "Treibstoffkosten: Transparente Abrechnung nach tatsächlichem Verbrauch (Betriebsstundenzähler)"
    ],
    mustHits: 8,
    mustTotal: 10,
    canHits: 12,
    canTotal: 16,
    serviceTypes: ["Erdbau", "Kranarbeiten", "Stromversorgung", "Baustelleneinrichtung"],
    scopeOfWork: "Bereitstellung von Erdbaugeräten, Kränen, Stromerzeugern für Neubau eines 45.000 qm Logistikzentrums über 180 Tage in verschiedenen Bauphasen",
    certifications: ["ISO 9001", "CE-Konformität"],
    evaluationCriteria: ["Preis 55%", "Gerätequalität 30%", "Flexibilität 15%"],
    safety: ["CE-Kennzeichnung", "Deutsche Betriebsanleitungen", "All-Risk-Versicherung"],
    penalties: ["Gerätewechsel verspätet: 1.000€/Tag", "Fehlende Zertifikate: 500€/Gerät"],
    submission: ["Firmenprofil", "Geräteliste mit CE-Nachweisen", "All-Risk-Versicherung", "Optional: Qualifikationsnachweise Bedienpersonal"],
  },
];

const DEFAULT_PROFILE: CompanyProfile = {
  name: "abc",
  address: "abc Str. 15, 85622 München",
  vatId: "DE123456789",
  permits: ["ISO 9001:2015", "ISO 14001", "CE-Konformität", "DGUV Regelwerk"],
  fleet: "Description",
  insurance: "Betriebshaftpflicht 15 Mio. € | Geräteversicherung inkl. Schäden, Diebstahl, höhere Gewalt",
  contactName: "a",
  contactEmail: "a@abc.de",
  depotPostcode: "12345",
  certifications: "ISO 9001:2015, ISO 14001, BGL 2020 konform, DGUV Vorschrift 52/70/52 zertifiziert",
};

const DEFAULT_DOCS: DocItem[] = [
  { id: "d-001", name: "ISO 9001:2015 Zertifikat (Qualitätsmanagement)", status: "present" },
  { id: "d-002", name: "Unbedenklichkeitsbescheinigung Finanzamt", status: "present" },
  { id: "d-003", name: "CE-Konformitätserklärungen Baugeräte", status: "present" },
  { id: "d-004", name: "DGUV Vorschrift 52/70/52 Prüfnachweise (UVV-Prüfungen)", status: "needs_update", notes: "einige Geräte noch nicht neu geprüft" },
  { id: "d-005", name: "Versicherungsnachweis Betriebshaftpflicht (15 Mio. €)", status: "present" },
  { id: "d-006", name: "BGL 2020 Gerätekalkulation & Preisblätter", status: "present" },
  { id: "d-007", name: "Referenzliste Bauprojekte (3 Jahre)", status: "present" },
  { id: "d-008", name: "Betriebsanleitungen (deutsch) für alle Geräte", status: "present" },
  { id: "d-009", name: "Maschinenführer-Qualifikationen (Zertifikate)", status: "needs_update", notes: "einige Kranscheine ablaufend" },
  { id: "d-010", name: "Wartungs- und Instandhaltungsnachweise", status: "present" },
];

const DEFAULT_PRICING: PricingInput = {
  projectDurationDays: 150,
  equipmentDailyRate: 850,
  deliveryDistance: 25,
  setupCost: 2500,
  operatorDailyRate: 320,
  fuelCostPerDay: 45,
  maintenanceCostPerDay: 25,
  insurancePerDay: 18,
  transportCostPerKm: 1.2,
  marginPct: 12,
};

// ---------------- Utils
const pct = (hits: number, total: number) => (total === 0 ? 0 : Math.round((100 * hits) / total));

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          alert(`Quelle: ${source}`);
        }}
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="font-medium">{source}</span>
      </button>
    </div>
  );
}

function euro(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function computeWinProbability(
  tender: Tender | null,
  missingCount: number,
  answers: Record<string, string>,
  mustPct: number
): number {
  if (!tender) return 0;
  const docPenalty = missingCount * 4; // -4% each issue
  const qMissing = REQUIRED_Q.filter((q) => !(answers[q.id]?.trim())).length;
  const qPenalty = qMissing * 3;
  const base = Math.max(0, tender.score - docPenalty - qPenalty);
  const mustBoost = Math.round(mustPct * 0.2);
  return Math.max(1, Math.min(99, Math.round((base + mustBoost) * 0.9 + 5)));
}

function routeFeasibilityScore(distanceKm: number, projectDays: number, fleetStr: string) {
  const regionalDepots = /Hamburg|Bremen|Hannover|Berlin|München|Köln|Stuttgart|Depot/i.test(fleetStr) ? 1 : 0;
  const distancePenalty = Math.max(0, distanceKm - 50) * 0.4; // soft cap 50 km for equipment delivery
  const durationBonus = Math.min(10, projectDays / 30 * 2); // longer projects = better logistics
  const raw = 100 - distancePenalty + durationBonus + regionalDepots * 8;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ---------------- Root
export default function ReikanTenderAI() {
  const [step, setStep] = useState<number>(1);
  const [mode, setMode] = useState<"search" | "upload">("search");
  const [query, setQuery] = useState<string>("");
  const [sortKey, setSortKey] = useState<"deadline" | "score">("deadline");
  const [results, setResults] = useState<Tender[]>([]);
  const [selected, setSelected] = useState<Tender | null>(null);
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [docs, setDocs] = useState<DocItem[]>(DEFAULT_DOCS);
  const [pricing, setPricing] = useState<PricingInput>(DEFAULT_PRICING);
  const [autoFill, setAutoFill] = useState<boolean>(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aiEdits, setAiEdits] = useState<Record<string, string>>(() => {
    const initialEdits: Record<string, string> = {};
    DEFAULT_DOCS.forEach(doc => {
      if (doc.status !== 'missing') {
        initialEdits[doc.id] = 'checked';
      }
    });
    return initialEdits;
  });
  const [riskAccepted, setRiskAccepted] = useState<boolean>(false);
  const [showTests, setShowTests] = useState<boolean>(false);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadedFromDb, setLoadedFromDb] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [autoFilling, setAutoFilling] = useState<boolean>(false);
  const [improvingScore, setImprovingScore] = useState<boolean>(false);
  const [searchingTenders, setSearchingTenders] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [draftingAnswer, setDraftingAnswer] = useState<Record<string, boolean>>({});
  const [loadingTenders, setLoadingTenders] = useState<boolean>(false);
  const [tendersError, setTendersError] = useState<string | null>(null);
  const [loadingTenderDetails, setLoadingTenderDetails] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [latestBatch, setLatestBatch] = useState<BatchSummaryPayload | null>(null);

  useEffect(() => {
    if (isProcessing) {
      // Clear previous tender data while a new batch is running
      setSelected(null);
      setLatestBatch(null);
    }
  }, [isProcessing]);



  const fetchTenderDetails = async (runId: string): Promise<Tender> => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    // Use /api/batches/:id/summary to get consistent ui_json data from run_summaries table
    const response = await fetch(`${apiUrl}/api/batches/${runId}/summary`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const payload = await response.json();
    if (!payload?.success || !payload?.data) {
      throw new Error('Tender details not available');
    }

    // payload.data is the raw DB row with structure: { id, run_id, ui_json, summary_json, ... }
    // We need to map ui_json to Tender UI model
    const rawData = payload.data;
    const batchPayload: BatchSummaryPayload = {
      batchId: rawData.run_id || runId,
      summary: {
        run_id: rawData.run_id || runId,
        ui_json: rawData.ui_json || {},
        total_files: rawData.total_files || 0,
        success_files: rawData.success_files || 0,
        failed_files: rawData.failed_files || 0,
        status: rawData.status || 'completed'
      }
    };

    // Map to Tender UI model using existing mapping function
    const mappedTender = mapSummaryToTender(batchPayload);
    // Preserve runId for refetching
    mappedTender.runId = runId;
    return mappedTender;
  };

  // Fetch tenders from backend API
  useEffect(() => {
    const fetchTenders = async () => {
      setLoadingTenders(true);
      setTendersError(null);
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/tenders?sortBy=${sortKey}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const payloadList = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.results)
              ? data.results
              : [];

        if (payloadList.length > 0) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:703', message: 'fetchTenders SUCCESS - setting results', data: { payloadListCount: payloadList.length, firstTenderKeys: Object.keys(payloadList[0]), firstTenderHasEvaluationCriteria: !!payloadList[0].evaluationCriteriaWithSource, hypothesisId: 'C' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
          // #endregion
          setResults(payloadList);
          // Only set selected if we don't have one yet, and preserve properly mapped data
          setSelected((prev) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:706', message: 'setSelected callback in fetchTenders', data: { hasPrev: !!prev, hasEvaluationCriteria: !!prev?.evaluationCriteriaWithSource, willPreserve: !!prev?.evaluationCriteriaWithSource, willUsePrev: !!prev, willUsePayload: !prev, hypothesisId: 'C' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
            // #endregion
            // Fix: Preserve selected if it has evaluationCriteriaWithSource (properly mapped from upload)
            if (prev?.evaluationCriteriaWithSource) return prev;
            return prev || payloadList[0];
          });
        } else {
          // If no data from API, show empty state (no mock data fallback)
          setResults([]);
          setSelected(null);
          console.log('No tenders from API - showing empty state');
        }
      } catch (error) {
        console.error('Error fetching tenders:', error);
        setTendersError(error instanceof Error ? error.message : 'Failed to fetch tenders');
        // Keep using MOCK_TENDERS as fallback
      } finally {
        setLoadingTenders(false);
      }
    };

    fetchTenders();
  }, [sortKey]);

  // Re-fetch tender details when navigating to Overview tab (step 2)
  // Fix: Always refetch fresh data to ensure consistency with ui_json
  useEffect(() => {
    const refetchTenderDetails = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:745', message: 'useEffect triggered - Overview tab navigation', data: { step, hasSelected: !!selected, runId: selected?.runId, selectedId: selected?.id, hasEvaluationCriteria: !!selected?.evaluationCriteriaWithSource, hypothesisId: 'A' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
      // #endregion
      // Always refetch when navigating to Overview tab if we have a runId or id
      const runId = selected?.runId || selected?.id;
      if (step === 2 && runId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:753', message: 'REFETCH TRIGGERED - fetching fresh details', data: { runId, hypothesisId: 'A' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
        // #endregion
        try {
          setLoadingTenderDetails(true);
          const freshDetails = await fetchTenderDetails(runId);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:760', message: 'FRESH DETAILS FETCHED - about to setSelected', data: { freshDetailsKeys: Object.keys(freshDetails), hasEvaluationCriteria: !!freshDetails.evaluationCriteriaWithSource, evaluationCriteriaLength: freshDetails.evaluationCriteriaWithSource?.length, risksLength: freshDetails.legalRisksWithSource?.length, metaSource: freshDetails.sources?.title, hypothesisId: 'A' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
          // #endregion
          // Replace the entire selected state with fresh data
          setSelected(freshDetails);
        } catch (error) {
          console.error('Failed to re-fetch tender details:', error);
          // Keep existing data if re-fetch fails
        } finally {
          setLoadingTenderDetails(false);
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:773', message: 'REFETCH SKIPPED - no runId/id available', data: { step, hasSelected: !!selected, hasRunId: !!selected?.runId, hasId: !!selected?.id, hypothesisId: 'A' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
        // #endregion
      }
    };

    refetchTenderDetails();
  }, [step]); // Only depend on step to avoid infinite loops

  // keyboard step nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(9, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mustPct = useMemo(() => pct(selected?.mustHits ?? 0, selected?.mustTotal ?? 0), [selected]);
  const canPct = useMemo(() => pct(selected?.canHits ?? 0, selected?.canTotal ?? 0), [selected]);
  const missingCount = useMemo(() => docs.filter((d) => d.status !== "present").length, [docs]);
  const routeScore = useMemo(
    () => routeFeasibilityScore(pricing.deliveryDistance, pricing.projectDurationDays, profile.fleet),
    [pricing, profile.fleet]
  );

  const winProb = useMemo(() => computeWinProbability(selected, missingCount, answers, mustPct), [selected, missingCount, answers, mustPct]);

  const { subtotal, surcharge, margin, total } = useMemo(() => calcPrice(pricing), [pricing]);

  const handleValidateConsistency = async () => {
    setValidating(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setValidating(false);
    alert('✓ Alle Daten erfolgreich validiert!\n\n- Firmenprofil vollständig\n- USt-IdNr. Format gültig\n- Kontaktinformationen geprüft\n- Nachweise aktuell');
  };

  const handleAutoFill = async () => {
    setAutoFilling(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setAutoFilling(false);
    alert('✓ Daten automatisch aus Datenraum ausgefüllt');
  };

  const handleImproveScore = async () => {
    setImprovingScore(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setImprovingScore(false);
    alert('✓ Vorschläge zur Bewertungsverbesserung:\n\n- Weitere relevante Nachweise hinzufügen\n- Fuhrparkinformationen aktualisieren\n- Zertifizierungen stärken');
  };

  const handleAIFind = async () => {
    setSearchingTenders(true);
    await new Promise(resolve => setTimeout(resolve, 1800));
    setSearchingTenders(false);
    alert('✓ KI-Suche abgeschlossen\n\n3 neue passende Ausschreibungen von eVergabe und TED gefunden');
  };

  const handleAIDraftAnswer = async (questionId: string) => {
    setDraftingAnswer(prev => ({ ...prev, [questionId]: true }));
    await new Promise(resolve => setTimeout(resolve, 1500));

    const draftAnswers: Record<string, string> = {
      experience: 'abc verfügt über mehr als 40 Jahre Erfahrung in der Baugeräte-Vermietung und Baustelleneinrichtung für Infrastrukturprojekte, Hochbau, Tiefbau und Spezialbauten in ganz Deutschland. Mit über 840.000 Mietgeräten europaweit und einem dichten Depot-Netzwerk haben wir erfolgreich Projekte für Autobahnen, Brückenbau, Wohnungsbau und Industrieanlagen realisiert. Referenzen umfassen DEGES, Hochtief, Strabag, Max Bögl und kommunale Bauämter.',
      fleetCapacity: 'Für dieses Projekt können wir aus unserem Bestand bereitstellen: Erdbaugeräte (Mobilbagger 1,5-40t, Radlader, Raupen), Hebezeuge (Mobilkrane, Turmdrehkrane, Gabelstapler), Baustelleneinrichtung (Container, Bürocontainer, Sanitärcontainer, Gerüste), Stromversorgung (Stromerzeuger 20-500 kVA), Verdichtungsgeräte, Betonpumpen, Hubarbeitsbühnen. Alle Geräte sind BGL 2020-kalkuliert, CE-konform, DGUV-geprüft mit aktuellen UVV-Plaketten.',
      equipmentTypes: 'abc deckt alle Gerätekategorien für Baustelleneinrichtung und Bauausführung ab: Erdbau (BGL 111-117), Transport/Fördern (BGL 210-230), Betonarbeiten (BGL 310-330), Gerüste/Schalungen (BGL 410-430), Baustelleneinrichtung (BGL 510-540), Hebezeuge (BGL 610-630), Energieversorgung (BGL 710-730), Verkehrssicherung, sowie Spezialgeräte für Straßen- und Tiefbau.',
      logistics: 'Logistik-Konzept: Anlieferung binnen 24h für Standardgeräte, 48h für Spezialgeräte ab nächstgelegenem Depot. Gerätetausch und Wartung erfolgen projektbegleitend ohne Stillstandzeiten. Transport erfolgt mit eigener LKW-Flotte inkl. Schwerlasttransport. Bei Geräteausfall garantieren wir Ersatzstellung binnen 4 Stunden. Digitales Tracking-System ermöglicht Echtzeit-Überwachung aller Geräte auf der Baustelle.',
      operators: 'abc kann qualifiziertes Bedienpersonal bereitstellen: Kranführer (Führerscheine Kran A/B), Baggerführer, Staplerfahrer, Hubarbeitsbühnen-Bediener. Alle Maschinenführer verfügen über gültige Befähigungsnachweise gemäß DGUV Vorschrift 52, BGG 921 und BetrSichV. Optional bieten wir Full-Service-Pakete mit Bedienpersonal, Wartung und Treibstoff-Versorgung an.',
      maintenance: 'Wartungskonzept: Alle Geräte werden vor Auslieferung nach DGUV Vorschrift 52/70 geprüft (UVV-Prüfung mit Plakette). Monatliche Inspektionen während der Projektlaufzeit durch zertifizierte Techniker. Wartungsbuch mit digitalem Zugriff. Bei Störungen erfolgt Reparatur auf der Baustelle oder Tausch binnen 4h. Jährliche Hauptuntersuchungen durch TÜV/DEKRA. 24/7 Service-Hotline für technische Unterstützung.',
      safety: 'Arbeitssicherheit: Alle Geräte tragen CE-Kennzeichnung gemäß Maschinenrichtlinie 2006/42/EG. DGUV Vorschrift 52 (Krane), DGUV Vorschrift 70 (Fahrzeuge), DGUV Vorschrift 68 (Flurförderzeuge) werden eingehalten. Betriebsanleitungen in Deutsch an jedem Gerät. Sicherheitseinweisungen für Bedienpersonal vor Projektbeginn. Unfallverhütungsvorschriften (UVV) werden strikt befolgt. Jährliche Schulungen unserer Techniker.',
      emergency: 'Notfall-Service: 24/7 Hotline unter 0800-ABC-24 für Geräteausfälle und technische Notfälle. Ersatzgeräte aus regionalem Pool binnen 4 Stunden auf der Baustelle. Bei kritischen Projekten kann dedizierter Bereitschaftsdienst vor Ort gestellt werden. Ersatzteillager an allen Hauptstandorten. Backup-Geräte sind stets vorgehalten. Im Schadensfall greift unsere Geräteversicherung (All-Risk inkl. Diebstahl, Vandalismus, höhere Gewalt).'
    };

    setAnswers(prev => ({ ...prev, [questionId]: draftAnswers[questionId] || 'AI-generated response based on company profile and tender requirements.' }));
    setDraftingAnswer(prev => ({ ...prev, [questionId]: false }));
  };

  const handleFetchFromDataroom = async () => {
    setUploading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setUploading(false);
    alert('✓ Dokumente aus Datenraum geladen\n\n- ISO 9001 Zertifikat (aktualisiert)\n- Versicherungsnachweis (aktuell)\n- Referenzliste (3 Projekte hinzugefügt)');
  };

  const handleImportURLs = async () => {
    setSearchingTenders(true);
    await new Promise(resolve => setTimeout(resolve, 1200));
    setSearchingTenders(false);
    const urls = prompt('Ausschreibungs-URLs oder GAEB-Dateien importieren:\n\nURLs (eine pro Zeile):\nhttps://example.com/tender/123\n\noder GAEB-Dateien hochladen:\n.X83, .X84, .D83 (Leistungsverzeichnis)');
    if (urls) {
      alert(`✓ Verarbeite ${urls.split('\n').filter(u => u.trim()).length} Ausschreibungen\n\nExtrahierte Informationen:\n- Auftraggeber & Vergabestelle\n- Lose & Teilleistungen\n- Fristen & Termine\n- Leistungsverzeichnis (GAEB)\n- VOB/BGL-Anforderungen`);
    }
  };

  const mapSummaryToTender = (payload: BatchSummaryPayload): Tender => {
    // Deep clone the payload to prevent mutation of cached data
    const uiJson = JSON.parse(JSON.stringify(payload.summary.ui_json || {}));
    const meta = uiJson.meta || {};
    const executive = uiJson.executive_summary || {};
    const timeline = uiJson.timeline_milestones || {};
    const requirements = Array.isArray(uiJson.mandatory_requirements)
      ? uiJson.mandatory_requirements
      : [];
    const risks = Array.isArray(uiJson.risks) ? uiJson.risks : [];
    const serviceTypes = Array.isArray(uiJson.service_types) ? uiJson.service_types : [];
    const evaluationCriteria = Array.isArray(uiJson.evaluation_criteria) ? uiJson.evaluation_criteria : [];
    const safety = Array.isArray(uiJson.safety_requirements) ? uiJson.safety_requirements : [];
    const penaltiesRaw = Array.isArray(uiJson.contract_penalties) ? uiJson.contract_penalties : [];
    const certificationsRaw = Array.isArray(uiJson.certifications_required) ? uiJson.certifications_required : [];
    const processSteps = Array.isArray(uiJson.process_steps) ? uiJson.process_steps : [];
    const missingEvidence = Array.isArray(uiJson.missing_evidence_documents) ? uiJson.missing_evidence_documents : [];

    // Don't hardcode deadline - show as missing if not available
    const deadline = timeline.submission_deadline_de || null;

    const submissionWithSource = pickTopRequirements(requirements, meta.source_document);
    const legalRisksWithSource = pickTopRisks(risks, meta.source_document);
    const evaluationCriteriaWithSource = pickTopCriteria(evaluationCriteria, meta.source_document);

    // Map missing evidence with source
    const missingEvidenceWithSource = missingEvidence
      .map((doc: any) => ({
        text: doc?.document_de || doc?.text,
        source_document: doc?.source_document || meta.source_document || "",
        source_chunk_id: doc?.source_chunk_id ?? null,
      }))
      .filter((doc: any) => doc.text && !isPlaceholder(doc.text));

    // Extract scope with source
    const scopeOfWorkSource: SourceInfo = {
      text: executive.brief_description_de || "",
      source_document: executive.source_document || meta.source_document || "",
      source_chunk_id: null,
    };

    const penalties = pickTopStrings(penaltiesRaw, 5);
    const certifications = pickTopStrings(certificationsRaw, 5);
    const timelineSteps = buildTimelineSteps(processSteps, timeline, meta.source_document);

    return {
      id: meta.tender_id || payload.summary.run_id || payload.batchId,
      title: meta.tender_title || executive.title_de || meta.tender_id || "Missing Title",
      buyer: meta.organization || executive.organization_de || "Missing Organization",
      region: executive.location_de || "DE",
      deadline,
      url: "",
      score: 85, // Default score, can be calculated based on match criteria
      legalRisks: legalRisksWithSource.map(r => r.text),
      legalRisksWithSource,
      mustHits: Math.min(requirements.length, 5),
      mustTotal: Math.min(requirements.length, 5),
      canHits: 0,
      canTotal: 0,
      serviceTypes: pickTopStrings(serviceTypes, 7),
      scopeOfWork: executive.brief_description_de || "",
      scopeOfWorkSource,
      submission: submissionWithSource.map(s => s.text),
      submissionWithSource,
      certifications,
      evaluationCriteria: evaluationCriteriaWithSource.map(e => e.text),
      evaluationCriteriaWithSource,
      safety,
      penalties,
      processSteps: timelineSteps,
      projectDuration: timeline.project_duration_de || null,
      economicAnalysis: uiJson.economic_analysis || undefined,
      missingEvidence: missingEvidenceWithSource.map(m => m.text),
      missingEvidenceWithSource,
      sources: {
        title: meta.source_document || "",
        buyer: meta.source_document || executive.source_document || "",
        mustCriteria: submissionWithSource[0]?.source_document || meta.source_document || "",
        logistics: executive.source_document || meta.source_document || "",
        deadline: timeline.source_document || meta.source_document || "",
        certifications: meta.source_document || "",
        scopeOfWork: executive.source_document || meta.source_document || "",
        pricingModel: "",
        penalties: meta.source_document || "",
        evaluationCriteria: evaluationCriteriaWithSource[0]?.source_document || meta.source_document || "",
        submission: submissionWithSource[0]?.source_document || meta.source_document || "",
        legalRisks: legalRisksWithSource[0]?.source_document || meta.source_document || "",
      },
    };
  };

  const handleTenderCreated = (payload: BatchSummaryPayload) => {
    setLatestBatch(payload);
    const tenderData = mapSummaryToTender(payload);
    // Fix: Set runId so refetch logic can work correctly
    tenderData.runId = payload.batchId;
    setSelected(tenderData);
    setMode("search");
    setStep(2);
  };

  const handleEstimateDistance = async () => {
    alert(`✓ Entfernungsberechnung\n\nVon: ${profile.depotPostcode || '28199 (Bremen)'}\nGeschätzte Entfernung: ${pricing.distanceKm || 12} km (einfach)\n\nRoute optimiert für Industriereinigungsfahrzeuge in Norddeutschland.`);
  };

  const handleAutoCalcFuel = async () => {
    alert(`✓ Marktpreise berechnet\n\nAktueller Preis: ${euro(pricing.pricePerSqmPerCleaning)}/m²\nBasierend auf: Marktdaten Norddeutschland (November 2025)\nEmpfohlen: €0,40-€0,55/m² je nach Leistungsart (Industriereinigung)`);
  };

  const handleExplainWeights = () => {
    if (!selected) return;
    alert(`Gewichtungs-Aufschlüsselung:\n\nMuss-Kriterien (60%):\n- ${selected.mustHits}/${selected.mustTotal} Anforderungen erfüllt\n- Kritische Compliance-Faktoren\n\nKann-Kriterien (30%):\n- ${selected.canHits}/${selected.canTotal} optionale Merkmale\n- Wettbewerbsvorteile\n\nLogistik-Machbarkeit (10%):\n- Entfernungs- und Häufigkeitsanalyse\n- Fuhrpark-Fähigkeiten`);
  };

  const handleComplianceCheck = async () => {
    alert(`✓ Compliance-Prüfung abgeschlossen\n\nAlle Dokumente geprüft:\n✓ Rechtliche Anforderungen erfüllt\n✓ Regulatorische Standards eingehalten\n✓ Branchenzertifizierungen gültig\n✓ Keine Konflikte erkannt\n\nBereit zur Einreichung.`);
  };

  const handleFillGapsWithTemplates = async () => {
    const missingDocs = docs.filter(d => d.status !== 'present');
    if (missingDocs.length === 0) {
      alert('Alle Dokumente sind vorhanden. Keine Vorlagen erforderlich.');
      return;
    }

    const templates: Record<string, string> = {};
    missingDocs.forEach(d => {
      templates[d.id] = `TEMPLATE - ${d.name}\n\n[Standard template provided by AI]\n\nThis template includes all required sections for:\n- ${d.name}\n\nPlease customize with your specific information before submission.`;
    });

    setAiEdits(prev => ({ ...prev, ...templates }));
    alert(`✓ Vorlagen erstellt für ${missingDocs.length} fehlende(s) Dokument(e)`);
  };

  const handleDocumentImprove = async (docId: string, docName: string) => {
    setAiEdits(prev => ({
      ...prev,
      [docId]: `IMPROVED VERSION - ${docName}\n\n[AI has enhanced this document with:]\n- Clearer structure and formatting\n- Added missing compliance sections\n- Updated regulatory references\n- Strengthened technical specifications\n\nThis document now meets all tender requirements and industry best practices.`
    }));
    alert('✓ Dokument mit KI-Vorschlägen verbessert');
  };

  const handleExportDataRoom = async () => {
    alert('✓ Exportiere Datenraum\n\nBereite vor:\n- Alle Dokumente\n- Firmenprofil\n- Preiskalkulationen\n- Antworten auf Fragen\n- Einreichungs-Metadaten\n\nExport wird in Ihrem Download-Ordner verfügbar sein.');
  };

  const handleSubmit = async () => {
    if (!riskAccepted) {
      alert('Bitte akzeptieren Sie die rechtlichen Risiken vor der Einreichung.');
      return;
    }
    await saveToDatabase();
    alert('✓ Ausschreibungs-Einreichung abgeschlossen!\n\nEinreichungs-ID: ' + (currentSubmissionId || 'Generiert') + '\n\nIhre Angebotsabgabe wurde:\n✓ Validiert\n✓ In Datenbank gespeichert\n✓ Bereit zur Überprüfung\n\nNächste Schritte:\n1. Generiertes Dokument prüfen\n2. Interne Freigaben einholen\n3. Über Vergabeportal einreichen');
  };

  const saveToDatabase = async () => {
    if (!selected) return;

    try {
      setSaving(true);

      let tenderId = selected.id;

      const { data: existingTender } = await dbService.supabase
        .from('tenders')
        .select('id')
        .eq('id', selected.id)
        .maybeSingle();

      if (!existingTender) {
        const tender = await dbService.createTender({
          id: selected.id,
          title: selected.title,
          buyer: selected.buyer,
          region: selected.region,
          deadline: selected.deadline || new Date().toISOString().split('T')[0],
          url: selected.url,
          score: selected.score,
          legal_risks: selected.legalRisks,
          must_hits: selected.mustHits,
          must_total: selected.mustTotal,
          can_hits: selected.canHits,
          can_total: selected.canTotal,
          waste_streams: selected.serviceTypes
        });
        tenderId = tender.id;
      }

      const profileData = await dbService.getOrCreateProfile({
        name: profile.name,
        address: profile.address,
        vat_id: profile.vatId,
        permits: profile.permits,
        fleet: profile.fleet,
        insurance: profile.insurance,
        contact_name: profile.contactName,
        contact_email: profile.contactEmail,
        depot_postcode: profile.depotPostcode || '',
        disposal_sites: profile.certifications || ''
      });
      setProfileId(profileData.id);

      let submissionId = currentSubmissionId;
      if (!submissionId) {
        const submission = await dbService.createSubmission({
          tender_id: tenderId,
          profile_id: profileData.id,
          win_probability: winProb,
          route_score: routeScore,
          risk_accepted: riskAccepted
        });
        submissionId = submission.id;
        setCurrentSubmissionId(submissionId);
      } else {
        await dbService.updateSubmission(submissionId, {
          win_probability: winProb,
          route_score: routeScore,
          risk_accepted: riskAccepted
        });
      }

      await dbService.saveDocuments(
        submissionId,
        docs.map(d => ({ name: d.name, status: d.status, notes: d.notes }))
      );

      await dbService.saveQAResponses(
        submissionId,
        REQUIRED_Q.map(q => ({
          questionId: q.id,
          questionLabel: q.label,
          answer: answers[q.id] || ''
        }))
      );

      await dbService.savePricing(submissionId, {
        pickups_per_week: pricing.cleaningsPerWeek,
        weeks_per_month: pricing.weeksPerMonth,
        distance_km: pricing.distanceKm,
        tonnage_per_month: pricing.squareMeters,
        disposal_fee_per_tonne: pricing.pricePerSqmPerCleaning,
        cost_per_km: pricing.costPerKm,
        lift_fees_per_month: pricing.materialCostsPerMonth + pricing.specialServicesPerMonth,
        fuel_surcharge_pct: 0,
        margin_pct: pricing.marginPct,
        subtotal,
        surcharge,
        margin,
        total
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving to database:', error);
      alert('Failed to save data to database');
    } finally {
      setSaving(false);
    }
  };

  const generateDocument = async () => {
    if (!selected) return;

    await saveToDatabase();

    const docContent = `
ECHT SAUBER! - AUSSCHREIBUNGS-EINREICHUNGSDOKUMENT
===================================================

AUSSCHREIBUNGSINFORMATIONEN
---------------------------
Titel: ${selected.title}
Auftraggeber: ${selected.buyer}
Region: ${selected.region}
Frist: ${new Date(selected.deadline).toLocaleDateString('de-DE')}
URL: ${selected.url}

FIRMENPROFIL
------------
Name: ${profile.name}
Adresse: ${profile.address}
USt-IdNr.: ${profile.vatId}
Ansprechpartner: ${profile.contactName} (${profile.contactEmail})
PLZ Standort: ${profile.depotPostcode || 'k.A.'}
Fuhrpark: ${profile.fleet}
Versicherung: ${profile.insurance}
Nachweise: ${profile.permits.join(', ')}
Zertifizierungen: ${profile.certifications || 'k.A.'}

BEWERTUNG & ANALYSE
-------------------
Gesamtbewertung: ${selected.score}%
Muss-Kriterien: ${pct(selected.mustHits, selected.mustTotal)}% (${selected.mustHits}/${selected.mustTotal})
Kann-Kriterien: ${pct(selected.canHits, selected.canTotal)}% (${selected.canHits}/${selected.canTotal})
Gewinnwahrscheinlichkeit: ${winProb}%
Logistik-Machbarkeit: ${routeScore}%

Leistungsarten: ${selected.serviceTypes.join(', ')}

Rechtliche Risiken:
${selected.legalRisks.map(risk => `- ${risk}`).join('\n')}

ERGÄNZENDE FRAGEN & ANTWORTEN
------------------------------
${REQUIRED_Q.map(q => `
${q.label}
${answers[q.id] || '[Nicht beantwortet]'}
`).join('\n')}

DOKUMENTEN-CHECKLISTE
---------------------
${docs.map(d => `${d.status === 'present' ? '✓' : '✗'} ${d.name} - ${d.status === 'present' ? 'vorhanden' : d.status === 'needs_update' ? 'aktualisieren' : 'fehlt'}${d.notes ? ` (${d.notes})` : ''}`).join('\n')}

PREISKALKULATION
----------------
Reinigungen pro Woche: ${pricing.cleaningsPerWeek}
Quadratmeter: ${pricing.squareMeters} m²
Entfernung (einfach): ${pricing.distanceKm} km
Preis pro m² pro Reinigung: ${euro(pricing.pricePerSqmPerCleaning)}
Kosten pro km: ${euro(pricing.costPerKm)}

Reinigungskosten: ${euro((pricing.squareMeters * pricing.pricePerSqmPerCleaning * pricing.cleaningsPerWeek * pricing.weeksPerMonth))}
Fahrtkosten: ${euro((pricing.cleaningsPerWeek * pricing.weeksPerMonth * pricing.distanceKm * 2 * pricing.costPerKm))}
Materialkosten: ${euro(pricing.materialCostsPerMonth)}
Sonderleistungen: ${euro(pricing.specialServicesPerMonth)}
Zwischensumme: ${euro(subtotal)}

Marge (${pricing.marginPct}%): ${euro(margin)}

GESAMTPREIS MONATLICH: ${euro(total)}

RISIKOAKZEPTANZ
---------------
Rechtliche Risiken wurden ${riskAccepted ? 'AKZEPTIERT' : 'NOCH NICHT AKZEPTIERT'}

Erstellt: ${new Date().toLocaleString('de-DE')}
Einreichungs-ID: ${currentSubmissionId || 'Nicht gespeichert'}
    `.trim();

    const blob = new Blob([docContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EchtSauber_Tender_${selected.id}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const Steps = [
    { id: 1, title: "Suche", desc: "Ausschreibungen" },
    { id: 2, title: "Kompakt", desc: "Übersicht" },
    { id: 3, title: "Firma", desc: "Firmendaten" },
    { id: 4, title: "Fragen", desc: "Ergänzung" },
    { id: 5, title: "Dokumente", desc: "Nachweise" },
    { id: 6, title: "Kalkulation", desc: "Preisermittlung" },
    { id: 7, title: "Bearbeitung", desc: "Feinschliff" },
    { id: 8, title: "Übersicht", desc: "Validierung" },
    { id: 9, title: "Abgabe", desc: "Chance" },
  ];

  const handleUpload = (files: FileList | null) => {
    if (!files) return;
    const updates: DocItem[] = [];
    Array.from(files).forEach((f, idx) => {
      updates.push({ id: `u-${Date.now()}-${idx}`, name: f.name, status: "present" });
    });
    setDocs((prev) => [...prev, ...updates]);
  };

  const setDocStatus = (id: string, status: DocItem["status"]) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  // simple search + sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = results.filter((t) => {
      if (!q) return true;
      const serviceTypes = Array.isArray(t.serviceTypes) ? t.serviceTypes : [];
      const title = t.title || "";
      const buyer = t.buyer || "";
      const region = t.region || "";
      return `${title} ${buyer} ${region} ${serviceTypes.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
    const sorted = [...pool].sort((a, b) => {
      if (sortKey === "deadline") return +new Date(a.deadline || 0) - +new Date(b.deadline || 0);
      return (b.score || 0) - (a.score || 0);
    });
    return sorted;
  }, [query, sortKey, results]);

  // Simple Auth Check (Rendered last to allow hooks to run)
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-100 p-4">
        <Card className="w-full max-w-sm shadow-xl">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground mb-4">Enter your password</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (fd.get("user") === "admin" && fd.get("pass") === "Tender@2026") {
                  setIsAuthenticated(true);
                } else {
                  alert("Incorrect Credentials");
                }
              }}
              className="space-y-4"
            >
              <Input name="user" placeholder="Username" required />
              <Input name="pass" type="password" placeholder="Password" required />
              <Button type="submit" className="w-full">
                Enter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-50 to-white p-6">
      <div className="mx-auto max-w-7xl">
        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mb-4 rounded-lg bg-blue-600 p-3 text-center text-white shadow-lg animate-pulse">
            <span className="flex items-center justify-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              File is processing... Data extraction in progress...
            </span>
          </div>
        )}

        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Truck className="h-6 w-6" /> abc
            </h1>
            <p className="text-sm text-zinc-500">Deutschland · Baugeräte & Baustelleneinrichtung · 840.000+ Mietgeräte</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={autoFill} onCheckedChange={setAutoFill} aria-label="AI autofill" />
            <span className="text-sm text-zinc-600">KI Auto-Ausfüllen</span>
          </div>
        </header>

        {/* Stepper */}
        <ol className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
          {Steps.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setStep(s.id)}
                className={`w-full rounded-2xl border p-3 text-left focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 ${step === s.id ? "border-zinc-900 bg-white shadow" : "border-zinc-200 bg-zinc-50 hover:bg-white"
                  }`}
                aria-current={step === s.id ? "step" : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">{s.title}</span>
                  {step > s.id ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 opacity-60" />}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{s.desc}</p>
              </button>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {step === 1 && (
              <StepScan
                query={query}
                setQuery={setQuery}
                results={filtered}
                selected={selected}
                setSelected={setSelected}
                loadingTenders={loadingTenders}
                tendersError={tendersError}
                onNext={() => setStep(2)}
                sortKey={sortKey}
                setSortKey={setSortKey}
                onAIFind={handleAIFind}
                onImportURLs={handleImportURLs}
                searching={searchingTenders}
                mode={mode}
                setMode={setMode}
                onTenderCreated={handleTenderCreated}
                onProcessingChange={setIsProcessing}
                fetchTenderDetails={fetchTenderDetails}
              />
            )}
            {step === 2 && selected && (() => {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:1362', message: 'RENDERING Overview (StepCriteria) with selected', data: { selectedKeys: Object.keys(selected), metaSource: selected.sources?.title, hasEvaluationCriteria: !!selected.evaluationCriteriaWithSource, evaluationCriteriaLength: selected.evaluationCriteriaWithSource?.length || 0, risksLength: selected.legalRisksWithSource?.length || 0, processStepsLength: selected.processSteps?.length || 0, hypothesisId: 'ALL' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
              // #endregion
              return (
                <StepCriteria
                  tender={selected}
                  routeScore={routeScore}
                  onNext={() => setStep(3)}
                  onBack={() => setStep(1)}
                  onImproveScore={handleImproveScore}
                  onExplainWeights={handleExplainWeights}
                  improvingScore={improvingScore}
                />
              );
            })()}
            {step === 2 && !selected && (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-zinc-600">Bitte wählen Sie einen Tender aus der Liste aus.</p>
                </CardContent>
              </Card>
            )}
            {step === 3 && (
              <StepCompany profile={profile} setProfile={setProfile} autoFill={autoFill} onNext={() => setStep(4)} onBack={() => setStep(2)} onAutoFill={handleAutoFill} onValidate={handleValidateConsistency} autoFilling={autoFilling} validating={validating} />
            )}
            {step === 4 && (
              <StepQA requiredQ={REQUIRED_Q} answers={answers} setAnswers={setAnswers} onNext={() => setStep(5)} onBack={() => setStep(3)} onAIDraft={handleAIDraftAnswer} draftingAnswer={draftingAnswer} />
            )}
            {step === 5 && (
              <StepDocs docs={docs} setDocStatus={setDocStatus} onUpload={handleUpload} onNext={() => setStep(6)} onBack={() => setStep(4)} onFetchFromDataroom={handleFetchFromDataroom} uploading={uploading} />
            )}
            {step === 6 && <StepPricing pricing={pricing} setPricing={setPricing} onNext={() => setStep(7)} onBack={() => setStep(5)} onEstimateDistance={handleEstimateDistance} onAutoCalcFuel={handleAutoCalcFuel} />}
            {step === 7 && <StepDocumentValidation onNext={() => setStep(8)} onBack={() => setStep(6)} />}
            {step === 8 && <StepEdit docs={docs} aiEdits={aiEdits} setAiEdits={setAiEdits} onNext={() => setStep(9)} onBack={() => setStep(7)} onImprove={handleDocumentImprove} onFillGaps={handleFillGapsWithTemplates} onComplianceCheck={handleComplianceCheck} />}
            {step === 9 && selected && (
              <StepSummary
                tender={selected}
                profile={profile}
                docs={docs}
                answers={answers}
                winProb={winProb}
                riskAccepted={riskAccepted}
                setRiskAccepted={setRiskAccepted}
                onBack={() => setStep(8)}
                pricing={{ subtotal, surcharge, margin, total }}
                routeScore={routeScore}
                onSave={saveToDatabase}
                onGenerateDoc={generateDocument}
                saving={saving}
                saveSuccess={saveSuccess}
                onExportDataRoom={handleExportDataRoom}
                onSubmit={handleSubmit}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Sticky Step Controls */}
        <div className="sticky bottom-4 mt-8 flex justify-center">
          <div className="flex items-center gap-2 rounded-2xl border bg-white/90 p-2 shadow backdrop-blur">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))}>Zurück</Button>
            <div className="h-6 w-px bg-zinc-200" />
            <Button onClick={() => setStep((s) => Math.min(9, s + 1))}>Weiter</Button>
          </div>
        </div>

        {/* Success Toast */}
        <AnimatePresence>
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="fixed bottom-8 right-8 z-50 rounded-2xl border border-green-200 bg-white p-4 shadow-xl"
            >
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100"
                >
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </motion.div>
                <div>
                  <div className="font-semibold text-green-900">Erfolgreich gespeichert!</div>
                  <div className="text-sm text-green-700">Alle Daten wurden in der Datenbank gespeichert</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dev tests toggle */}
        <div className="mt-8 flex items-center justify-between rounded-2xl border p-4">
          <div>
            <div className="text-sm font-medium">Entwickler-Tests</div>
            <div className="text-xs text-zinc-500">Aktivieren um Test-Ergebnisse der Gewinnwahrscheinlichkeits-Logik anzuzeigen.</div>
          </div>
          <Switch checked={showTests} onCheckedChange={setShowTests} />
        </div>
        {showTests && <DevTests />}
      </div>
    </div>
  );
}

// ---------------- Step 1
function StepScan({
  query,
  setQuery,
  results,
  selected,
  setSelected,
  loadingTenders,
  tendersError,
  onNext,
  sortKey,
  setSortKey,
  onAIFind,
  onImportURLs,
  searching,
  mode,
  setMode,
  onTenderCreated,
  onProcessingChange,
  fetchTenderDetails,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: Tender[];
  selected: Tender | null;
  setSelected: (t: Tender) => void;
  loadingTenders: boolean;
  tendersError: string | null;
  onNext: () => void;
  sortKey: "deadline" | "score";
  setSortKey: (k: "deadline" | "score") => void;
  onAIFind: () => Promise<void>;
  onImportURLs: () => Promise<void>;
  searching: boolean;
  mode: "search" | "upload";
  setMode: (m: "search" | "upload") => void;
  onTenderCreated: (payload: BatchSummaryPayload) => void;
  onProcessingChange?: (status: boolean) => void;
  fetchTenderDetails: (runId: string) => Promise<Tender>;
}) {
  if (mode === "upload") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("search")}
          >
            <ChevronRight className="h-4 w-4 mr-2 rotate-180" />
            Zurück zur Suche
          </Button>
        </div>
        <FileUploadZone onTenderCreated={onTenderCreated} onProcessingChange={onProcessingChange} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="inline-flex items-center gap-2"><Search className="h-5 w-5" />Passende Ausschreibungen finden</span>
              <Button variant="ghost" size="sm" className="gap-2" aria-label="Search options" title="Search options">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchbegriffe, Region, Auftraggeber, Leistungsart" aria-label="Ausschreibungen suchen" />
            <div className="flex gap-2">
              <Button variant="secondary" className="w-full" onClick={onImportURLs} disabled={searching}>URLs / GAEB importieren</Button>
              <Button className="w-full" onClick={onAIFind} disabled={searching}>
                {searching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Suche läuft...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    KI-Suche
                  </>
                )}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">Oder Dokumente hochladen</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setMode("upload")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Dokumente hochladen
              </Button>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>Sortieren nach</span>
              <div className="inline-flex gap-1 rounded-xl border p-1">
                <button
                  onClick={() => setSortKey("deadline")}
                  className={`rounded-lg px-2 py-1 ${sortKey === "deadline" ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
                >
                  Frist
                </button>
                <button
                  onClick={() => setSortKey("score")}
                  className={`rounded-lg px-2 py-1 ${sortKey === "score" ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
                >
                  Bewertung
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-500">Links von eVergabe, Subreport, TED einfügen oder GAEB-Dateien (.X83, .D83) importieren. System extrahiert automatisch Auftraggeber, Lose, Fristen, Leistungsverzeichnis und VOB-relevante Anforderungen.</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ergebnisse</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {results.length === 0 && !loadingTenders && (
              <div className="rounded-2xl border p-6 text-center">
                <p className="text-sm text-zinc-600 mb-2">Keine Ausschreibungen gefunden.</p>
                <p className="text-xs text-zinc-500">
                  {tendersError
                    ? `API Fehler: ${tendersError}. Bitte überprüfen Sie die Backend-Verbindung.`
                    : ''}
                </p>
              </div>
            )}
            {loadingTenders && (
              <div className="rounded-2xl border p-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                <p className="text-sm text-zinc-600">Lade Tender...</p>
              </div>
            )}
            {results.map((t) => (
              <button
                key={t.id}
                onClick={async () => {
                  try {
                    const runId = t.runId || t.id;
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:1583', message: 'TENDER CARD CLICKED', data: { tenderId: t.id, runId, tenderKeys: Object.keys(t), hasEvaluationCriteria: !!t.evaluationCriteriaWithSource, hypothesisId: 'B' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
                    // #endregion
                    const details = await fetchTenderDetails(runId);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:1587', message: 'SETTING selected with FETCHED details', data: { detailsKeys: Object.keys(details), hasEvaluationCriteria: !!details.evaluationCriteriaWithSource, hypothesisId: 'B' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
                    // #endregion
                    setSelected(details);
                    onNext();
                  } catch (err) {
                    console.error('Failed to load tender details:', err);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/70bc6035-312b-4a30-a0b3-2cb694b82ca0', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ReikanTenderAI.tsx:1591', message: 'ERROR PATH - setting selected with RAW tender from results', data: { tenderKeys: Object.keys(t), hasEvaluationCriteria: !!t.evaluationCriteriaWithSource, hypothesisId: 'B' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial' }) }).catch(() => { });
                    // #endregion
                    setSelected(t);
                    onNext();
                  }
                }}
                className={`group w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 ${selected?.id === t.id ? "border-zinc-900 bg-white shadow" : "border-zinc-200 bg-zinc-50 hover:bg-white"
                  }`}
                aria-pressed={selected?.id === t.id}
              >
                <div className="grid grid-cols-12 items-start gap-3">
                  {/* Meta column */}
                  <div className="col-span-12 md:col-span-8">
                    <div className="flex flex-col gap-1">
                      {/* Organization name in bold */}
                      <h3 className="font-bold text-base" title={t.buyer}>{t.buyer}</h3>
                      {/* Tender title below organization */}
                      {t.title && t.title !== 'Missing Title' ? (
                        <p className="text-sm text-zinc-700 font-medium">{t.title}</p>
                      ) : null}
                    </div>

                  </div>

                  {/* Side column */}
                  <div className="col-span-12 md:col-span-4 md:text-right">

                    <div className="mt-3 flex items-center gap-2 md:justify-end">
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs hover:bg-zinc-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LinkIcon className="h-3.5 w-3.5" /> Öffnen
                      </a>
                      <Button size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); }}>
                        Weiter <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Step 2
function StepCriteria({
  tender,
  routeScore,
  onNext,
  onBack,
  onImproveScore,
  onExplainWeights,
  improvingScore,
}: {
  tender: Tender;
  routeScore: number;
  onNext: () => void;
  onBack: () => void;
  onImproveScore: () => Promise<void>;
  onExplainWeights: () => void;
  improvingScore: boolean;
}) {
  const goNoGo = tender.score >= 70 && pct(tender.mustHits, tender.mustTotal) >= 80 ? 'GO' : 'NO-GO';
  const [expanded, setExpanded] = useState(false);
  const limit = 400;
  const scope = tender.scopeOfWork ?? "";
  const scopeShort = scope.length > limit ? scope.slice(0, limit) + "..." : scope;

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Executive Summary
            <Badge className={`${goNoGo === 'GO' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
              {goNoGo}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-1">Kurzbeschreibung</h4>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap break-words">
                {tender.buyer} sucht {tender.title}. Leistungsort: {tender.region}.{" "}
                {expanded ? scope : scopeShort}
              </p>

              {scope.length > limit && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setExpanded(v => !v)}
                >
                  {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                </button>
              )}
              {tender.scopeOfWorkSource?.source_document && (
                <SourceBadge source={tender.scopeOfWorkSource.source_document} />
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">A. Go / No-Go Entscheidung</h4>
                <ul className="text-xs space-y-3">
                  <li className="flex items-start gap-2">
                    <span className={`font-medium mt-0.5 ${pct(tender.mustHits, tender.mustTotal) >= 80 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pct(tender.mustHits, tender.mustTotal) >= 80 ? '✓' : '✗'}
                    </span>
                    <div className="flex-1">
                      <div><strong>Muss-Kriterien:</strong> {pct(tender.mustHits, tender.mustTotal)}% ({tender.mustHits}/{tender.mustTotal})</div>
                      <SourceBadge source={tender.sources?.mustCriteria} />
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className={`font-medium mt-0.5 ${routeScore >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {routeScore >= 70 ? '✓' : '⚠'}
                    </span>
                    <div className="flex-1">
                      <div><strong>Region/Logistik:</strong> {routeScore}% Machbarkeit</div>
                      <SourceBadge source={tender.sources?.logistics} />
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className={`font-medium mt-0.5 ${tender.deadline && new Date(tender.deadline) > new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {tender.deadline && new Date(tender.deadline) > new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? '✓' : '⚠'}
                    </span>
                    <div className="flex-1">
                      <div><strong>Einreichfrist:</strong> {tender.deadline ? new Date(tender.deadline).toLocaleDateString('de-DE') : 'Nicht bekannt'}</div>
                      <SourceBadge source={tender.sources?.deadline} />
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className={`font-medium mt-0.5 ${tender.certifications && tender.certifications.length > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                      {tender.certifications && tender.certifications.length > 0 ? '✓' : '○'}
                    </span>
                    <div className="flex-1">
                      <div><strong>Zertifikate:</strong> {tender.certifications && tender.certifications.length > 0 ? tender.certifications.join(', ') : 'Standard'}</div>
                      <SourceBadge source={tender.sources?.certifications} />
                    </div>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">B. Angebotsfähigkeit (Operativ)</h4>
                <ul className="text-xs space-y-3 text-zinc-700">
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-400 mt-0.5">•</span>
                    <div className="flex-1">
                      <div><strong>Logistik:</strong> {routeScore}% Machbarkeit, {tender.region}</div>
                      <SourceBadge source={tender.sources?.logistics} />
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-400 mt-0.5">•</span>
                    <div className="flex-1">
                      <div><strong>Leistungsumfang:</strong> {tender.scopeOfWork ? tender.scopeOfWork.substring(0, 80) + '...' : 'Siehe Dokumente'}</div>
                      <SourceBadge source={tender.sources?.scopeOfWork} />
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-400 mt-0.5">•</span>
                    <div><strong>SLA:</strong> {tender.safety && tender.safety.length > 0 ? 'Spezielle Anforderungen' : 'Standard erforderlich'}</div>
                  </li>
                </ul>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">C. Wirtschaftlichkeit</h4>
                <ul className="text-xs space-y-3 text-zinc-700">
                  {tender.economicAnalysis?.criticalSuccessFactors && tender.economicAnalysis.criticalSuccessFactors.length > 0 ? (
                    tender.economicAnalysis.criticalSuccessFactors
                      .filter((factor) => {
                        const text = typeof factor === "object" ? factor.text : factor;
                        return text && !isPlaceholder(text);
                      })
                      .slice(0, 3)
                      .map((factor, i) => (
                        <li key={`economic-factor-${typeof factor === 'object' ? factor.text?.substring(0, 30) : factor?.substring(0, 30)}-${i}`} className="flex items-start gap-2">
                          <span className="text-zinc-400 mt-0.5">•</span>
                          <div className="flex-1">
                            <span className="font-medium">{typeof factor === 'object' ? factor.text : factor}</span>
                            {typeof factor === 'object' && factor.source_document && (
                              <DocumentSourceInline
                                source_document={factor.source_document}
                                source_chunk_id={factor.source_chunk_id}
                                page_number={factor.page_number}
                              />
                            )}
                          </div>
                        </li>
                      ))
                  ) : (
                    <li className="flex items-start gap-2">
                      <span className="text-zinc-400 mt-0.5">•</span>
                      <div><strong>Preismodell:</strong> Standard</div>
                    </li>
                  )}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">D. Zuschlagslogik</h4>
                <ul className="text-xs space-y-3 text-zinc-700">
                  {tender.evaluationCriteriaWithSource && tender.evaluationCriteriaWithSource.length > 0 ? (
                    tender.evaluationCriteriaWithSource
                      .filter((criteria) => criteria.text && !isPlaceholder(criteria.text))
                      .slice(0, 5)
                      .map((criteria, i) => (
                        <li key={`eval-criteria-src-${criteria.text?.substring(0, 30)}-${criteria.source_document}-${i}`} className="flex items-start gap-2">
                          <span className="text-zinc-400 mt-0.5">•</span>
                          <div className="flex-1">
                            <span className="font-medium">{criteria.text}</span>
                            <DocumentSourceInline
                              source_document={criteria.source_document}
                              source_chunk_id={criteria.source_chunk_id}
                              page_number={criteria.page_number}
                            />
                          </div>
                        </li>
                      ))
                  ) : tender.evaluationCriteria && tender.evaluationCriteria.length > 0 ? (
                    tender.evaluationCriteria.slice(0, 5).map((criteria, i) => (
                      <li key={`eval-criteria-${criteria?.substring(0, 30)}-${i}`} className="flex items-start gap-2">
                        <span className="text-zinc-400 mt-0.5">•</span>
                        <div><strong>{criteria}</strong></div>
                      </li>
                    ))
                  ) : (
                    <li className="flex items-start gap-2">
                      <span className="text-zinc-400 mt-0.5">•</span>
                      <div><strong>Kriterien:</strong> Standard</div>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">E. Top-5 Pflichtanforderungen</h4>
                <ul className="text-xs space-y-2 mb-3">
                  {tender.submissionWithSource && tender.submissionWithSource.length > 0 ? (
                    tender.submissionWithSource
                      .filter((req) => req.text && !isPlaceholder(req.text))
                      .slice(0, 5)
                      .map((req, i) => (
                        <li key={`req-src-${req.text?.substring(0, 30)}-${req.source_document}-${i}`} className="flex items-start gap-2">
                          <span className="text-zinc-400 mt-0.5">{i + 1}.</span>
                          <div className="flex-1">
                            <span>{req.text}</span>
                            {req.detail && !isPlaceholder(req.detail) && (
                              <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
                                {req.detail}
                              </div>
                            )}
                            <DocumentSourceInline
                              source_document={req.source_document}
                              source_chunk_id={req.source_chunk_id}
                              page_number={req.page_number}
                            />
                          </div>
                        </li>
                      ))
                  ) : tender.submission && tender.submission.length > 0 ? (
                    tender.submission.slice(0, 5).map((req, i) => (
                      <li key={`req-${req?.substring(0, 30)}-${i}`} className="flex items-start gap-2">
                        <span className="text-zinc-400 mt-0.5">{i + 1}.</span>
                        <span>{req}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-zinc-500 italic">Keine Pflichtanforderungen verfügbar</li>
                  )}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">Haupt-Risiken</h4>
                <div className="mb-3">
                  {tender.legalRisksWithSource && tender.legalRisksWithSource.length > 0 ? (
                    <RiskList risksWithSource={tender.legalRisksWithSource} large />
                  ) : tender.legalRisks && tender.legalRisks.length > 0 ? (
                    <RiskList risks={tender.legalRisks} large />
                  ) : (
                    <p className="text-xs text-zinc-500 italic">Keine Risiken verfügbar</p>
                  )}
                </div>
                <SourceBadge source={tender.sources?.legalRisks} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">Vertragsstrafen</h4>
                {tender.penalties && tender.penalties.length > 0 ? (
                  <ul className="text-xs space-y-2 text-zinc-700">
                    {tender.penalties
                      .filter((penalty) => penalty && !isPlaceholder(penalty))
                      .slice(0, 5)
                      .map((penalty, i) => (
                        <li key={`penalty-${penalty?.substring(0, 30)}-${i}`} className="flex items-start gap-2">
                          <span className="text-amber-600 mt-0.5">•</span>
                          <span className="line-clamp-2">{penalty}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-500 italic">Keine Vertragsstrafen angegeben</p>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-3">Zertifizierungen erforderlich</h4>
                {tender.certifications && tender.certifications.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tender.certifications
                      .filter((cert) => cert && !isPlaceholder(cert))
                      .slice(0, 5)
                      .map((cert, i) => (
                        <Badge key={`cert-${cert?.substring(0, 30)}-${i}`} variant="outline" className="text-xs">
                          {cert}
                        </Badge>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">Keine Zertifizierungen angegeben</p>
                )}
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Detailed Assessment with KPI Percentages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detailed assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg border border-zinc-200">
              <p className="text-xs text-zinc-600 mb-1">Must-hit</p>
              <p className="text-3xl font-bold text-zinc-900">{tender.mustHitPercent || pct(tender.mustHits, tender.mustTotal)}%</p>
              <p className="text-xs text-zinc-500 mt-1">{tender.mustHits}/{tender.mustTotal}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-zinc-200">
              <p className="text-xs text-zinc-600 mb-1">Possible-hit</p>
              <p className="text-3xl font-bold text-zinc-900">{tender.possibleHitPercent || pct(tender.canHits, tender.canTotal)}%</p>
              <p className="text-xs text-zinc-500 mt-1">{tender.canHits}/{tender.canTotal}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-zinc-200">
              <p className="text-xs text-zinc-600 mb-1">In-total</p>
              <p className="text-3xl font-bold text-zinc-900">{tender.score}%</p>
              <p className="text-xs text-zinc-500 mt-1">Weighted</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-zinc-200">
              <p className="text-xs text-zinc-600 mb-1">Logistics</p>
              <p className="text-3xl font-bold text-zinc-900">{tender.logisticsScore || 100}%</p>
              <p className="text-xs text-zinc-500 mt-1">Document frequency</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Fehlende Nachweise & Dokumente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tender.submission && tender.submission.length > 0 ? (
                <div className="space-y-2">
                  {tender.submission.map((doc, idx) => (
                    <div key={`submission-doc-${doc?.substring(0, 30)}-${idx}`} className="flex items-start gap-2 text-sm p-2 bg-zinc-50 rounded border border-zinc-200">
                      <CheckCircle2 className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                      <span className="text-zinc-700">{doc}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Keine spezifischen Dokumente angegeben</p>
              )}
              <div className="pt-2 mt-2 border-t border-zinc-200">
                <p className="text-xs text-zinc-500 mb-2">Standard-Nachweise für Baugeräte-Ausschreibungen:</p>
                <ul className="text-xs space-y-1 text-zinc-600">
                  <li>• Gewerbeanmeldung / Handelsregisterauszug</li>
                  <li>• Betriebshaftpflichtversicherung</li>
                  <li>• Referenzprojekte (min. 3 vergleichbare Aufträge)</li>
                  <li>• CE-Konformitätserklärungen für alle Geräte</li>
                  <li>• DGUV-Prüfnachweise (UVV-Prüfungen)</li>
                  <li>• Qualifikationsnachweise Bedienpersonal</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" />
              Wirtschaftlichkeitsanalyse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {getEconomicText(tender.economicAnalysis?.potentialMargin) && (
                  <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-medium mb-1">Potenzielle Marge</p>
                    <p className="text-xl font-bold text-emerald-900">
                      {getEconomicText(tender.economicAnalysis?.potentialMargin)}
                    </p>
                  </div>
                )}
                {getEconomicText(tender.economicAnalysis?.orderValueEstimated) && (
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium mb-1">Auftragswert (geschätzt)</p>
                    <p className="text-xl font-bold text-blue-900">
                      {getEconomicText(tender.economicAnalysis?.orderValueEstimated)}
                    </p>
                  </div>
                )}
              </div>

              {(getEconomicText(tender.economicAnalysis?.competitiveIntensity) ||
                getEconomicText(tender.economicAnalysis?.logisticsCosts) ||
                getEconomicText(tender.economicAnalysis?.contractRisk)) && (
                  <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-2">
                    {getEconomicText(tender.economicAnalysis?.competitiveIntensity) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">Wettbewerbsintensität</span>
                        <span className="font-semibold text-zinc-900">
                          {getEconomicText(tender.economicAnalysis?.competitiveIntensity)}
                        </span>
                      </div>
                    )}
                    {getEconomicText(tender.economicAnalysis?.logisticsCosts) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">Logistik-Aufwand</span>
                        <span className="font-semibold text-zinc-900">
                          {getEconomicText(tender.economicAnalysis?.logisticsCosts)}
                        </span>
                      </div>
                    )}
                    {getEconomicText(tender.economicAnalysis?.contractRisk) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">Vertragsrisiko</span>
                        <span className="font-semibold text-amber-600">
                          {getEconomicText(tender.economicAnalysis?.contractRisk)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

              {tender.economicAnalysis?.criticalSuccessFactors &&
                tender.economicAnalysis.criticalSuccessFactors.some((factor) => {
                  const text = typeof factor === "object" ? factor.text : factor;
                  return text && !isPlaceholder(text);
                }) ? (
                <div className="pt-2 border-t border-zinc-200">
                  <p className="text-xs font-medium text-zinc-700 mb-2">Kritische Erfolgsfaktoren:</p>
                  <ul className="text-xs space-y-1 text-zinc-600">
                    {tender.economicAnalysis.criticalSuccessFactors
                      .filter((factor) => {
                        const text = typeof factor === "object" ? factor.text : factor;
                        return text && !isPlaceholder(text);
                      })
                      .slice(0, 3)
                      .map((factor, i) => (
                        <li key={`success-factor-${typeof factor === 'object' ? factor.text?.substring(0, 30) : factor?.substring(0, 30)}-${i}`} className="flex items-center gap-1">
                          <span>• {typeof factor === "object" ? factor.text : factor}</span>
                          {typeof factor === "object" && factor.source_document && (
                            <DocumentSourceInline
                              source_document={factor.source_document}
                              source_chunk_id={factor.source_chunk_id}
                              page_number={factor.page_number}
                            />
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evaluation Criteria Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Bewertungskriterien
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tender.evaluationCriteriaWithSource && tender.evaluationCriteriaWithSource.length > 0 ? (
              tender.evaluationCriteriaWithSource
                .filter((crit) => crit.text && !isPlaceholder(crit.text))
                .slice(0, 5)
                .map((crit, idx) => (
                  <div key={`eval-crit-card-${crit.text?.substring(0, 30)}-${crit.source_document}-${idx}`} className="flex items-start gap-2 p-3 bg-zinc-50 rounded border border-zinc-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900">{crit.text}</p>
                      {crit.source_document && (
                        <DocumentSourceInline
                          source_document={crit.source_document}
                          source_chunk_id={crit.source_chunk_id}
                          page_number={crit.page_number}
                        />
                      )}
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-sm text-zinc-500 italic">Keine Bewertungskriterien verfügbar</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Zeitplan & Meilensteine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs text-blue-700 font-medium mb-1">Abgabefrist</p>
                {tender.deadline ? (
                  <>
                    <p className="text-sm font-bold text-blue-900">
                      {new Date(tender.deadline).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {Math.ceil((new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} Tage verbleibend
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-amber-600">Missing</p>
                )}
              </div>
              {tender.projectDuration && (
                <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                  <p className="text-xs text-emerald-700 font-medium mb-1">Projektdauer</p>
                  <p className="text-sm font-bold text-emerald-900">{tender.projectDuration}</p>
                </div>
              )}
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-xs text-zinc-700 font-medium mb-1">Vorbereitung</p>
                <p className="text-sm font-bold text-zinc-900">3-5 Tage</p>
                <p className="text-xs text-zinc-600 mt-1">Dokumente & Kalkulation</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-xs text-zinc-700 font-medium mb-1">Interne Freigabe</p>
                <p className="text-sm font-bold text-zinc-900">2-3 Tage</p>
                <p className="text-xs text-zinc-600 mt-1">Prüfung & Genehmigung</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <p className="text-xs text-zinc-700 font-medium mb-1">Puffer</p>
                <p className="text-sm font-bold text-zinc-900">1-2 Tage</p>
                <p className="text-xs text-zinc-600 mt-1">Sicherheitsreserve</p>
              </div>
            </div>

            <div className="space-y-2">
              {tender.processSteps && tender.processSteps.length > 0 ? (
                tender.processSteps
                  .filter((step) => step.title_de && !isPlaceholder(step.title_de))
                  .slice(0, 6)
                  .map((step) => (
                    <div key={step.step} className="flex items-start gap-3 p-2 bg-zinc-50 rounded">
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-900">
                          {step.title_de || `Schritt ${step.step}`} {step.days_de && `(${step.days_de})`}
                        </p>
                        {step.description_de && !isPlaceholder(step.description_de) && (
                          <p className="text-xs text-zinc-600">{step.description_de}</p>
                        )}
                        {step.source_document && (
                          <DocumentSourceInline source_document={step.source_document} page_number={step.page_number} />
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-zinc-500 italic p-2">Keine Prozessschritte verfügbar</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Detaillierte Bewertung</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 items-center gap-4">
              <Metric title="Muss-Treffer" value={`${pct(tender.mustHits, tender.mustTotal)}%`} caption={`${tender.mustHits}/${tender.mustTotal}`} />
              <Metric title="Kann-Treffer" value={`${pct(tender.canHits, tender.canTotal)}%`} caption={`${tender.canHits}/${tender.canTotal}`} />
              <Metric title="Gesamt" value={`${tender.score}%`} caption="Gewichtet" />
              <Metric title="Logistik" value={`${routeScore}%`} caption="Entfernung/Häufigkeit" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={onImproveScore} disabled={improvingScore}>
              {improvingScore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Bewertung verbessern
                </>
              )}
            </Button>
            <Button variant="secondary" className="w-full" onClick={onExplainWeights}>
              Gewichtung erklären
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onBack} className="w-full">
                Zurück
              </Button>
              <Button onClick={onNext} className="w-full">
                Weiter
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Step 3
function StepCompany({ profile, setProfile, autoFill, onNext, onBack, onAutoFill, onValidate, autoFilling, validating }: { profile: CompanyProfile; setProfile: (p: CompanyProfile) => void; autoFill: boolean; onNext: () => void; onBack: () => void; onAutoFill: () => Promise<void>; onValidate: () => Promise<void>; autoFilling: boolean; validating: boolean }) {
  const update = (k: keyof CompanyProfile, v: string | string[] | undefined) => setProfile({ ...profile, [k]: v } as CompanyProfile);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            Firmendaten {autoFill && <Badge className="ml-2" variant="secondary">KI ausgefüllt</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput label="Firmenname" value={profile.name} onChange={(v) => update("name", v)} />
            <LabeledInput label="USt-IdNr." value={profile.vatId} onChange={(v) => update("vatId", v)} />
          </div>
          <LabeledInput label="Adresse" value={profile.address} onChange={(v) => update("address", v)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput label="Fuhrpark" value={profile.fleet} onChange={(v) => update("fleet", v)} />
            <LabeledInput label="Versicherung" value={profile.insurance} onChange={(v) => update("insurance", v)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <LabeledInput label="PLZ Standort" value={profile.depotPostcode || ""} onChange={(v) => update("depotPostcode", v)} />
            <LabeledInput label="Zertifizierungen" value={profile.certifications || ""} onChange={(v) => update("certifications", v)} />
            <LabeledInput label="Kontakt E-Mail" value={profile.contactEmail} onChange={(v) => update("contactEmail", v)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput label="Ansprechpartner" value={profile.contactName} onChange={(v) => update("contactName", v)} />
            <TagEditor label="Nachweise" tags={profile.permits} onChange={(tags) => update("permits", tags)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assistenz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={onAutoFill} disabled={autoFilling}>
            {autoFilling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fülle aus...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Aus Datenraum ausfüllen
              </>
            )}
          </Button>
          <Button variant="secondary" className="w-full" onClick={onValidate} disabled={validating}>
            {validating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Prüfe...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Daten prüfen
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack} className="w-full">
              Zurück
            </Button>
            <Button onClick={onNext} className="w-full">
              Weiter
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Step 4
function StepQA({ requiredQ, answers, setAnswers, onNext, onBack, onAIDraft, draftingAnswer }: { requiredQ: { id: string; label: string; hint?: string }[]; answers: Record<string, string>; setAnswers: (r: Record<string, string>) => void; onNext: () => void; onBack: () => void; onAIDraft: (qId: string) => Promise<void>; draftingAnswer: Record<string, boolean> }) {
  const set = (k: string, v: string) => setAnswers({ ...answers, [k]: v });
  const missing = requiredQ.filter((q) => !(answers[q.id]?.trim())).length;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Ergänzungsfragen beantworten</CardTitle>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-900">
                <p className="font-medium mb-1">Warum diese Fragen?</p>
                <p className="text-amber-800">
                  Diese Ergänzungsfragen erfragen spezifische Informationen, die nicht aus Ihren Firmenstammdaten
                  abgeleitet werden können. Sie sind entscheidend für eine vollständige Angebotsabgabe und müssen
                  individuell für jede Ausschreibung beantwortet werden.
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {requiredQ.map((q) => (
            <div key={q.id} className="grid gap-2">
              <label className="text-sm font-medium">{q.label}</label>
              {q.hint && <p className="text-xs text-zinc-500 -mt-1">{q.hint}</p>}
              <Textarea value={answers[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} placeholder="Antwort eingeben oder KI-Entwurf anfordern" rows={4} />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => onAIDraft(q.id)} disabled={draftingAnswer[q.id]}>
                  {draftingAnswer[q.id] ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Erstelle...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-1 h-4 w-4" />
                      KI-Entwurf
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="sm">
                  Vorlage verwenden
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-zinc-600">Fehlende Antworten: {missing}</div>
          <Progress value={Math.round(((requiredQ.length - missing) / requiredQ.length) * 100)} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack} className="w-full">
              Back
            </Button>
            <Button onClick={onNext} className="w-full">
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Step 5
function StepDocs({ docs, setDocStatus, onUpload, onNext, onBack, onFetchFromDataroom, uploading }: { docs: DocItem[]; setDocStatus: (id: string, s: DocItem["status"]) => void; onUpload: (files: FileList | null) => void; onNext: () => void; onBack: () => void; onFetchFromDataroom: () => Promise<void>; uploading: boolean }) {
  const missing = docs.filter((d) => d.status !== "present");
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Relevante Dokumente sammeln</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {docs.map((d) => (
            <div key={d.id} className="flex items-start justify-between rounded-xl border p-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.name}</span>
                    {d.status === "present" && <Badge variant="secondary">vorhanden</Badge>}
                    {d.status === "needs_update" && <Badge className="bg-yellow-100 text-yellow-900">aktualisieren</Badge>}
                    {d.status === "missing" && <Badge className="bg-red-100 text-red-900">fehlt</Badge>}
                  </div>
                  {d.notes && <p className="text-xs text-zinc-500">{d.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDocStatus(d.id, "present")}>
                  Vorhanden
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDocStatus(d.id, "needs_update")}>
                  Aktualisieren
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDocStatus(d.id, "missing")}>
                  Fehlt
                </Button>
              </div>
            </div>
          ))}
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border p-2 px-3 text-sm hover:bg-zinc-50">
                <Upload className="h-4 w-4" />
                <span>Dateien hochladen</span>
                <input type="file" className="hidden" multiple onChange={(e) => onUpload(e.target.files)} />
              </label>
              <Button variant="secondary" onClick={onFetchFromDataroom} disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Lade...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Aus Datenraum laden
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Warnungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {missing.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-sky-700">
              <Check className="h-4 w-4" />Alles in Ordnung
            </div>
          ) : (
            missing.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" /> {m.name} {m.status === "missing" ? "fehlt" : m.notes || "aktualisieren"}
              </div>
            ))
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack} className="w-full">
              Back
            </Button>
            <Button onClick={onNext} className="w-full">
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Step 6: Pricing calculation for construction equipment rental (BGL-based)
function calcPrice(p: PricingInput) {
  // Equipment rental costs
  const equipmentRental = p.equipmentDailyRate * p.projectDurationDays;

  // Transport costs (delivery + pickup)
  const transportCosts = (p.deliveryDistance * 2) * p.transportCostPerKm;

  // Operating costs
  const operatorCosts = p.operatorDailyRate * p.projectDurationDays;
  const fuelCosts = p.fuelCostPerDay * p.projectDurationDays;
  const maintenanceCosts = p.maintenanceCostPerDay * p.projectDurationDays;
  const insuranceCosts = p.insurancePerDay * p.projectDurationDays;

  // Setup/breakdown
  const setupCosts = p.setupCost;

  // Subtotal before margin
  const subtotal = equipmentRental + transportCosts + operatorCosts + fuelCosts + maintenanceCosts + insuranceCosts + setupCosts;

  // No surcharge for equipment rental (BGL-based)
  const surcharge = 0;

  // Profit margin
  const margin = (subtotal * p.marginPct) / 100;

  // Total tender price
  const total = Math.round(subtotal + margin);

  return {
    subtotal,
    surcharge,
    margin,
    total,
    equipmentRental,
    transportCosts,
    operatorCosts,
    fuelCosts,
    maintenanceCosts,
    insuranceCosts,
    setupCosts
  };
}

function StepPricing({ pricing, setPricing, onNext, onBack, onEstimateDistance, onAutoCalcFuel }: { pricing: PricingInput; setPricing: (p: PricingInput) => void; onNext: () => void; onBack: () => void; onEstimateDistance: () => Promise<void>; onAutoCalcFuel: () => Promise<void> }) {
  const { subtotal, surcharge, margin, total, equipmentRental, transportCosts, operatorCosts, fuelCosts, maintenanceCosts, insuranceCosts, setupCosts } = useMemo(() => calcPrice(pricing), [pricing]);
  const set = (k: keyof PricingInput, v: number) => setPricing({ ...pricing, [k]: v });

  const samplePositions: LVPosition[] = [
    {
      position_code: '01.01.001',
      position_name: 'Baustelleneinrichtung und Vorhaltekosten',
      unit: 'Psch',
      quantity: 1,
      unit_price: 12500.00,
      total_price: 12500.00
    },
    {
      position_code: '01.01.002',
      position_name: 'Baustrom',
      unit: 'Monat',
      quantity: 5,
      unit_price: 450.00,
      total_price: 2250.00
    },
    {
      position_code: '01.02.001',
      position_name: 'Gerätevorhaltung Bagger',
      unit: 'Tag',
      quantity: pricing.projectDurationDays,
      unit_price: pricing.equipmentDailyRate,
      total_price: pricing.projectDurationDays * pricing.equipmentDailyRate
    },
    {
      position_code: '01.04.001',
      position_name: 'Stromerzeuger',
      unit: 'Tag',
      quantity: pricing.projectDurationDays,
      unit_price: 120.00,
      total_price: pricing.projectDurationDays * 120.00
    },
    {
      position_code: '01.03.001',
      position_name: 'Gerüstbau und -vorhaltung',
      unit: 'm²',
      quantity: 850,
      unit_price: 35.00,
      total_price: 29750.00
    }
  ];

  const applyPreset = (preset: "lean" | "standard" | "premium") => {
    if (preset === "lean") setPricing({ ...pricing, marginPct: 8, equipmentDailyRate: 750, operatorDailyRate: 0 });
    if (preset === "standard") setPricing({ ...pricing, marginPct: 12, equipmentDailyRate: 850, operatorDailyRate: 320 });
    if (preset === "premium") setPricing({ ...pricing, marginPct: 18, equipmentDailyRate: 1050, operatorDailyRate: 380 });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" />Preiskalkulation – Baugeräte-Vermietung (BGL 2020)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NumInput label="Projektdauer (Tage)" value={pricing.projectDurationDays} onChange={(n) => set("projectDurationDays", n)} />
              <NumInput label="Geräte-Tagessatz (€)" value={pricing.equipmentDailyRate} onChange={(n) => set("equipmentDailyRate", n)} />
              <NumInput label="Einrichtungskosten (€)" value={pricing.setupCost} onChange={(n) => set("setupCost", n)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NumInput label="Bediener/Tag (€)" value={pricing.operatorDailyRate} onChange={(n) => set("operatorDailyRate", n)} />
              <NumInput label="Treibstoff/Tag (€)" value={pricing.fuelCostPerDay} onChange={(n) => set("fuelCostPerDay", n)} />
              <NumInput label="Wartung/Tag (€)" value={pricing.maintenanceCostPerDay} onChange={(n) => set("maintenanceCostPerDay", n)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NumInput label="Versicherung/Tag (€)" value={pricing.insurancePerDay} onChange={(n) => set("insurancePerDay", n)} />
              <NumInput label="Lieferentfernung (km)" value={pricing.deliveryDistance} onChange={(n) => set("deliveryDistance", n)} />
              <NumInput label="Transport €/km" value={pricing.transportCostPerKm} onChange={(n) => set("transportCostPerKm", n)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <NumInput label="Gewinnmarge (%)" value={pricing.marginPct} onChange={(n) => set("marginPct", n)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Schnellvorlagen:</span>
              <Button variant="secondary" size="sm" onClick={() => applyPreset("lean")}>Günstig (nur Gerät)</Button>
              <Button variant="secondary" size="sm" onClick={() => applyPreset("standard")}>Standard (mit Bediener)</Button>
              <Button variant="secondary" size="sm" onClick={() => applyPreset("premium")}>Premium (Full-Service)</Button>
            </div>

            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric title="Gerätemiete" value={euro(equipmentRental)} caption={`${pricing.projectDurationDays} Tage`} />
              <Metric title="Transport" value={euro(transportCosts)} caption="Hin + Rück" />
              <Metric title="Bediener" value={euro(operatorCosts)} caption="optional" />
              <Metric title="Betrieb" value={euro(fuelCosts + maintenanceCosts + insuranceCosts)} caption="Fuel+Wartung+Vers." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Metric title="Einrichtung" value={euro(setupCosts)} caption="einmalig" />
              <Metric title="Zwischensumme" value={euro(subtotal)} />
              <Metric title={`Marge (${pricing.marginPct}%)`} value={euro(margin)} />
              <Metric title="Angebotspreis" value={euro(total)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={onAutoCalcFuel}>
              <Sparkles className="mr-2 h-4 w-4" />BGL-Sätze berechnen
            </Button>
            <Button variant="secondary" className="w-full" onClick={onEstimateDistance}>
              <MapPin className="mr-2 h-4 w-4" />Entfernung vom Depot
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onBack} className="w-full">
                Zurück
              </Button>
              <Button onClick={onNext} className="w-full">
                Weiter
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <PriceValidation
        positions={samplePositions}
        projectType="Baugeräte"
        region="DE-HH"
      />

      <CalculationDetails />
    </div>
  );
}

// ---------------- Step 7: Dokumentenpaket Übersicht & Validierung
function StepDocumentValidation({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  interface DocumentItem {
    id: string;
    name: string;
    description: string;
    format: string;
    size: string;
    modified: string;
    category: string;
    categoryBadge: string;
    required: boolean;
    status: "ready" | "missing" | "needs_update";
    completeness: number;
  }

  const documents: DocumentItem[] = [
    { id: "doc-001", name: "Cover Letter (Anschreiben)", description: "Formal cover letter addressing the buyer and introducing your company", format: "PDF", size: "156 KB", modified: "7.1.2026", category: "administrative", categoryBadge: "administrative", required: true, status: "ready", completeness: 100 },
    { id: "doc-002", name: "Company Registration (Handelsregisterauszug)", description: "Official company registration certificate", format: "PDF", size: "284 KB", modified: "31.12.2025", category: "administrative", categoryBadge: "legal", required: true, status: "ready", completeness: 100 },
    { id: "doc-003", name: "Price Calculation (Preiskalkulation)", description: "Detailed pricing breakdown with unit costs and total calculation", format: "EXCEL", size: "892 KB", modified: "7.1.2026", category: "financial", categoryBadge: "financial", required: true, status: "ready", completeness: 100 },
    { id: "doc-004", name: "Technical Specifications (Technische Spezifikationen)", description: "Complete technical documentation of proposed solution", format: "PDF", size: "1.2 MB", modified: "7.1.2026", category: "technical", categoryBadge: "technical", required: true, status: "ready", completeness: 100 },
    { id: "doc-005", name: "Reference Projects (Referenzprojekte)", description: "Portfolio of 3-5 similar completed projects with client references", format: "PDF", size: "2.4 MB", modified: "7.1.2026", category: "references", categoryBadge: "references", required: true, status: "ready", completeness: 100 },
    { id: "doc-006", name: "Company Profile (Firmenprofil)", description: "Company presentation including history, team, and capabilities", format: "PDF", size: "3.8 MB", modified: "30.12.2025", category: "administrative", categoryBadge: "administrative", required: true, status: "ready", completeness: 100 },
    { id: "doc-007", name: "Insurance Certificate (Versicherungsnachweis)", description: "Proof of liability insurance coverage", format: "PDF", size: "445 KB", modified: "15.12.2025", category: "administrative", categoryBadge: "legal", required: true, status: "ready", completeness: 100 },
    { id: "doc-008", name: "ISO 9001:2015 Certificate", description: "Quality management system certification", format: "PDF", size: "678 KB", modified: "1.11.2025", category: "technical", categoryBadge: "technical", required: true, status: "ready", completeness: 100 },
    { id: "doc-009", name: "BGL 2020 Equipment Catalog", description: "Complete equipment catalog with BGL codes and pricing", format: "EXCEL", size: "1.5 MB", modified: "7.1.2026", category: "technical", categoryBadge: "technical", required: true, status: "ready", completeness: 100 },
    { id: "doc-010", name: "Safety & DGUV Compliance", description: "Safety documentation and DGUV compliance certificates", format: "PDF", size: "890 KB", modified: "20.12.2025", category: "technical", categoryBadge: "technical", required: true, status: "ready", completeness: 100 },
    { id: "doc-011", name: "Financial Statements", description: "Annual financial statements for last 3 years", format: "PDF", size: "1.1 MB", modified: "30.11.2025", category: "financial", categoryBadge: "financial", required: true, status: "ready", completeness: 100 },
    { id: "doc-012", name: "Tax Clearance Certificate", description: "Certificate of no tax arrears from tax office", format: "PDF", size: "234 KB", modified: "28.12.2025", category: "administrative", categoryBadge: "legal", required: true, status: "ready", completeness: 100 },
    { id: "doc-013", name: "Project Timeline (Projektplan)", description: "Detailed project schedule and milestones", format: "PDF", size: "567 KB", modified: "7.1.2026", category: "technical", categoryBadge: "technical", required: true, status: "ready", completeness: 100 },
  ];

  const categories = [
    { id: "all", name: "All Documents", count: documents.length },
    { id: "administrative", name: "Administrative", count: documents.filter(d => d.category === "administrative").length },
    { id: "technical", name: "Technical", count: documents.filter(d => d.category === "technical").length },
    { id: "financial", name: "Financial", count: documents.filter(d => d.category === "financial").length },
    { id: "references", name: "References", count: documents.filter(d => d.category === "references").length },
  ];

  const filteredDocs = activeCategory === "all" ? documents : documents.filter(d => d.category === activeCategory);
  const totalSize = "12.3 MB";
  const requiredCount = documents.filter(d => d.required).length;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "administrative": return "bg-blue-100 text-blue-700";
      case "technical": return "bg-emerald-100 text-emerald-700";
      case "financial": return "bg-amber-100 text-amber-700";
      case "legal": return "bg-purple-100 text-purple-700";
      case "references": return "bg-pink-100 text-pink-700";
      default: return "bg-zinc-100 text-zinc-700";
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Dokumentenpaket fertig
              </h3>
              <p className="text-sm text-emerald-700">
                Ihr vollständiges Dokumentenpaket mit {documents.length} professionellen Dokumenten ist bereit zum Download und zur Überprüfung.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-xs text-zinc-500 mb-1">Gesamtdokumente</div>
              <div className="text-3xl font-bold text-emerald-600">{documents.length}</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-xs text-zinc-500 mb-1">Erforderlich</div>
              <div className="text-3xl font-bold text-emerald-600">{requiredCount}</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-xs text-zinc-500 mb-1">Gesamtgröße</div>
              <div className="text-3xl font-bold text-emerald-600">{totalSize}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-zinc-700" />
              <CardTitle className="text-base">Dokumentenpaket</CardTitle>
            </div>
            <Button size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Alle als ZIP herunterladen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeCategory === cat.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
                {cat.name}
                <span className="ml-2 text-xs opacity-70">{cat.count}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <FileText className="h-5 w-5 text-zinc-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm text-zinc-900">{doc.name}</h4>
                        {doc.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                      </div>
                      <p className="text-xs text-zinc-500 mb-2">{doc.description}</p>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{doc.format}</span>
                        <span>{doc.size}</span>
                        <span>Modified: {doc.modified}</span>
                        <Badge className={`text-xs ${getCategoryColor(doc.categoryBadge)}`}>{doc.categoryBadge}</Badge>
                      </div>
                      <div className="mt-2">
                        <Progress value={doc.completeness} className="h-1" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Ready</span>
                    </div>
                    <Button size="sm" variant="ghost" className="gap-1"><FileText className="h-4 w-4" />Preview</Button>
                    <Button size="sm" variant="ghost" className="gap-1"><Download className="h-4 w-4" />Download</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={onBack} className="w-full">Zurück</Button>
            <Button onClick={onNext} className="w-full">Weiter zur Bearbeitung</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Step 8
function StepEdit({ docs, aiEdits, setAiEdits, onNext, onBack, onImprove, onFillGaps, onComplianceCheck }: { docs: DocItem[]; aiEdits: Record<string, string>; setAiEdits: (r: Record<string, string>) => void; onNext: () => void; onBack: () => void; onImprove: (docId: string, docName: string) => Promise<void>; onFillGaps: () => Promise<void>; onComplianceCheck: () => Promise<void> }) {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pruefbericht' | 'felder' | 'fundstellen'>('pruefbericht');
  const [checkingDocs, setCheckingDocs] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'alle' | 'probleme' | 'ablauf'>('alle');
  const [allSelected, setAllSelected] = useState(false);

  const handleCheckDocument = async (docId: string, docName: string) => {
    setCheckingDocs((prev) => ({ ...prev, [docId]: true }));
    await onImprove(docId, docName);
    setCheckingDocs((prev) => ({ ...prev, [docId]: false }));
  };

  const getDocumentStatus = (doc: DocItem) => {
    if (doc.status === "missing") return { label: "Fehlt", variant: "destructive" as const };
    if (doc.status === "needs_update") return { label: "Abgelaufen", variant: "destructive" as const };
    if (aiEdits[doc.id]) return { label: "Geprüft", variant: "secondary" as const };
    return { label: "Hochgeladen", variant: "default" as const };
  };

  const getExpiryInfo = (docName: string) => {
    if (docName.includes("ISO")) {
      return { days: 45, text: "Läuft in 45 Tagen ab" };
    } else if (docName.includes("Referenz")) {
      return { days: 14, text: "Läuft in 14 Tagen ab" };
    } else if (docName.includes("Hygiene")) {
      return { days: 60, text: "Läuft in 60 Tagen ab" };
    }
    return null;
  };

  const getMockCheckResults = (docName: string) => {
    const results: { type: 'warning' | 'info' | 'success'; message: string; page: number }[] = [];

    if (docName.includes("ISO")) {
      results.push({ type: 'warning', message: 'Zertifikat läuft in 45 Tagen ab (Erneuerung empfohlen)', page: 1 });
      results.push({ type: 'info', message: 'Ausstellende Stelle: DQS GmbH (akkreditiert)', page: 1 });
      results.push({ type: 'info', message: 'Gültigkeitsbereich: Gebäudereinigung und Facility Management', page: 2 });
    } else if (docName.includes("Hygiene")) {
      results.push({ type: 'warning', message: '3 Mitarbeiter haben Schulung älter als 24 Monate', page: 2 });
      results.push({ type: 'info', message: 'Schulungsnachweis für 42 Mitarbeiter vorhanden', page: 1 });
      results.push({ type: 'info', message: 'Gesundheitsamt Stade als ausstellende Behörde', page: 1 });
    } else if (docName.includes("DIN")) {
      results.push({ type: 'info', message: 'Zertifizierung: Gebäudereinigung nach DIN 77400', page: 1 });
      results.push({ type: 'success', message: 'Alle Anforderungen erfüllt', page: 1 });
    } else if (docName.includes("Versicherung")) {
      results.push({ type: 'info', message: 'Betriebshaftpflichtversicherung aktiv', page: 1 });
      results.push({ type: 'info', message: 'Deckungssumme entspricht Anforderungen', page: 1 });
    } else if (docName.includes("Referenz")) {
      results.push({ type: 'warning', message: 'Referenzliste läuft in 14 Tage ab', page: 1 });
      results.push({ type: 'info', message: '3 Referenzprojekte dokumentiert', page: 1 });
    } else {
      results.push({ type: 'info', message: 'Dokument erfolgreich hochgeladen', page: 1 });
      results.push({ type: 'success', message: 'Keine Probleme gefunden', page: 1 });
    }

    return results;
  };

  const getMockExtractedFields = (docName: string) => {
    if (docName.includes("ISO")) {
      return [
        { label: "Zertifikatstyp", value: "ISO 9001 (Qualitätsmanagement)" },
        { label: "Zertifikatsnummer", value: "DE-QM-2024-12345" },
        { label: "Ausstellungsdatum", value: "12.12.2022" },
        { label: "Gültig bis", value: "11.12.2025" },
        { label: "Ausstellende Stelle", value: "DQS GmbH" },
        { label: "Gültigkeitsbereich", value: "Gebäudereinigung und Facility Management" },
      ];
    } else if (docName.includes("Hygiene")) {
      return [
        { label: "Dokumenttyp", value: "Hygieneschulungen Nachweise (IfSG)" },
        { label: "Anzahl Mitarbeiter", value: "42" },
        { label: "Ausstellende Behörde", value: "Gesundheitsamt Stade" },
        { label: "Letzte Schulung", value: "15.08.2024" },
      ];
    }
    return [
      { label: "Dokumenttyp", value: docName },
      { label: "Datum", value: "12.12.2025" },
      { label: "Status", value: "Gültig" },
    ];
  };

  const filteredDocs = docs.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'probleme') {
      return doc.status === 'missing' || doc.status === 'needs_update';
    }
    if (filterMode === 'ablauf') {
      return doc.status === 'needs_update' || doc.name.includes('Referenz');
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Dokumente mit KI prüfen</h2>
          <p className="text-sm text-zinc-500">Überprüfen Sie hochgeladene Dokumente auf Vollständigkeit und Gültigkeit</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Suche..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={filterMode === 'alle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMode('alle')}
          >
            Alle
          </Button>
          <Button
            variant={filterMode === 'probleme' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMode('probleme')}
          >
            Nur Probleme
          </Button>
          <Button
            variant={filterMode === 'ablauf' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMode('ablauf')}
          >
            Ablauf &lt; 30 Tage
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={onComplianceCheck}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Alle prüfen
        </Button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={allSelected}
          onChange={(e) => setAllSelected(e.target.checked)}
        />
        <span className="text-sm font-medium">Alle auswählen</span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredDocs.map((doc) => {
          const status = getDocumentStatus(doc);
          const isSelected = selectedDoc === doc.id;
          const isChecking = checkingDocs[doc.id];
          const expiryInfo = getExpiryInfo(doc.name);

          return (
            <div key={doc.id} className="border rounded-xl overflow-hidden bg-white">
              <div className="p-4 flex items-center justify-between hover:bg-zinc-50 cursor-pointer" onClick={() => setSelectedDoc(isSelected ? null : doc.id)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    onChange={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <FileText className="h-5 w-5 text-zinc-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{doc.name}</span>
                      <span className="text-xs text-zinc-500">PDF · 12.12.2025 · 245 KB</span>
                      {expiryInfo && (
                        <span className={`text-xs font-medium ${expiryInfo.days <= 14 ? 'text-orange-600' : expiryInfo.days <= 30 ? 'text-orange-500' : 'text-amber-600'
                          }`}>
                          · {expiryInfo.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc.status !== "missing" && (
                    <>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isChecking}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCheckDocument(doc.id, doc.name);
                        }}
                      >
                        {isChecking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Prüfen
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {doc.status === "missing" && (
                    <Button size="sm" variant="default">
                      <Upload className="mr-2 h-4 w-4" />
                      Hochladen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                    {isSelected ? "∧" : "∨"}
                  </Button>
                </div>
              </div>

              <AnimatePresence>
                {isSelected && doc.status !== "missing" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t bg-zinc-50"
                  >
                    <div className="p-4">
                      <div className="flex gap-4 border-b mb-4">
                        <button
                          className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'pruefbericht' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          onClick={() => setActiveTab('pruefbericht')}
                        >
                          Prüfbericht
                          {activeTab === 'pruefbericht' && (
                            <motion.div
                              layoutId="activeTab"
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900"
                            />
                          )}
                        </button>
                        <button
                          className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'felder' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          onClick={() => setActiveTab('felder')}
                        >
                          Extrahierte Felder
                          {activeTab === 'felder' && (
                            <motion.div
                              layoutId="activeTab"
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900"
                            />
                          )}
                        </button>
                        <button
                          className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'fundstellen' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
                            }`}
                          onClick={() => setActiveTab('fundstellen')}
                        >
                          Fundstellen
                          {activeTab === 'fundstellen' && (
                            <motion.div
                              layoutId="activeTab"
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900"
                            />
                          )}
                        </button>
                      </div>

                      <AnimatePresence mode="wait">
                        {activeTab === 'pruefbericht' && (
                          <motion.div
                            key="pruefbericht"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-3"
                          >
                            {!aiEdits[doc.id] ? (
                              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                                Noch kein Ergebnis. Starte die KI-Prüfung mit dem Button "Prüfen".
                              </div>
                            ) : (
                              getMockCheckResults(doc.name).map((result, idx) => (
                                <div
                                  key={idx}
                                  className={`rounded-lg border p-4 ${result.type === 'warning'
                                    ? 'bg-orange-50 border-orange-200'
                                    : result.type === 'success'
                                      ? 'bg-green-50 border-green-200'
                                      : 'bg-blue-50 border-blue-200'
                                    }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {result.type === 'warning' && <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />}
                                    {result.type === 'info' && <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />}
                                    {result.type === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />}
                                    <div className="flex-1">
                                      <p className={`text-sm font-medium ${result.type === 'warning' ? 'text-orange-900' : result.type === 'success' ? 'text-green-900' : 'text-blue-900'
                                        }`}>
                                        {result.message}
                                      </p>
                                      <p className={`text-xs mt-1 ${result.type === 'warning' ? 'text-orange-700' : result.type === 'success' ? 'text-green-700' : 'text-blue-700'
                                        }`}>
                                        Seite {result.page}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </motion.div>
                        )}

                        {activeTab === 'felder' && (
                          <motion.div
                            key="felder"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-3"
                          >
                            {!aiEdits[doc.id] ? (
                              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                                Noch keine Daten extrahiert. Starte die KI-Prüfung mit dem Button "Prüfen".
                              </div>
                            ) : (
                              <div className="grid gap-3">
                                {getMockExtractedFields(doc.name).map((field, idx) => (
                                  <div key={idx} className="grid grid-cols-2 gap-4 p-3 rounded-lg border bg-white">
                                    <div className="text-sm font-medium text-zinc-700">{field.label}</div>
                                    <div className="text-sm text-zinc-900">{field.value}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}

                        {activeTab === 'fundstellen' && (
                          <motion.div
                            key="fundstellen"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-3"
                          >
                            {!aiEdits[doc.id] ? (
                              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                                Noch keine Fundstellen. Starte die KI-Prüfung mit dem Button "Prüfen".
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-sm text-zinc-600">
                                  Relevante Textstellen im Dokument:
                                </div>
                                {getMockCheckResults(doc.name).map((result, idx) => (
                                  <div key={idx} className="p-3 rounded-lg border bg-white hover:bg-zinc-50 cursor-pointer">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-zinc-500">Seite {result.page}</span>
                                      <LinkIcon className="h-3 w-3 text-zinc-400" />
                                    </div>
                                    <p className="text-sm text-zinc-700">{result.message}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="ghost" onClick={onBack}>
          Zurück
        </Button>
        <Button onClick={onNext}>
          Weiter zur Abgabe
        </Button>
      </div>
    </div>
  );
}

// ---------------- Step 8
function StepSummary({ tender, profile, docs, answers, winProb, riskAccepted, setRiskAccepted, onBack, pricing, routeScore, onSave, onGenerateDoc, saving, saveSuccess, onExportDataRoom, onSubmit }: { tender: Tender; profile: CompanyProfile; docs: DocItem[]; answers: Record<string, string>; winProb: number; riskAccepted: boolean; setRiskAccepted: (v: boolean) => void; onBack: () => void; pricing: { subtotal: number; surcharge: number; margin: number; total: number }; routeScore: number; onSave: () => Promise<void>; onGenerateDoc: () => Promise<void>; saving: boolean; saveSuccess: boolean; onExportDataRoom: () => Promise<void>; onSubmit: () => Promise<void> }) {
  const readyDocs = docs.filter((d) => d.status === "present").length;
  const totalDocs = docs.length;
  const unanswered = Object.keys(answers).filter((k) => !answers[k]?.trim()).length;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-xl border p-4">
            <div className="mb-1 text-sm text-zinc-500">Tender</div>
            <div className="text-sm font-medium">
              {tender.title} · {tender.buyer} · Due {new Date(tender.deadline).toLocaleDateString()}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric title="Gewinnchance" value={`${winProb}%`} caption="Heuristik" />
            <Metric title="Logistik" value={`${routeScore}%`} caption="Machbarkeit" />
            <Metric title="Dokumente" value={`${readyDocs}/${totalDocs}`} caption="bereit" />
            <Metric title="Offen" value={`${unanswered}`} caption="Fragen" />
          </div>
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric title="Preis Gesamt" value={euro(pricing.total)} caption="inkl. Marge" />
            <Metric title="Zwischensumme" value={euro(pricing.subtotal)} />
            <Metric title="Zuschlag" value={euro(pricing.surcharge)} />
            <Metric title="Marge" value={euro(pricing.margin)} />
          </div>
          <Separator />
          <div className="grid gap-2">
            <h4 className="text-sm font-medium">Einreichungs-Checkliste</h4>
            <ul className="grid gap-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4" /> Teilnahmeberechtigung bestätigt
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4" /> Dokumente zusammengestellt
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4" /> Preisblatt beigefügt
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4" /> Zusammenfassung geprüft
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abschließen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <div className="text-sm font-medium">Rechtliche Risiken akzeptieren</div>
              <div className="text-xs text-zinc-500">Sie bestätigen, dass die aufgeführten Risiken geprüft wurden.</div>
            </div>
            <Switch checked={riskAccepted} onCheckedChange={setRiskAccepted} />
          </div>
          <Button onClick={onSave} disabled={saving} className="w-full relative overflow-hidden">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichere...
              </>
            ) : saveSuccess ? (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="inline-flex items-center"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Erfolgreich gespeichert!
                </motion.div>
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                In Datenbank speichern
              </>
            )}
          </Button>
          <Button disabled={!riskAccepted} onClick={onGenerateDoc} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Dokument erstellen & herunterladen
          </Button>
          <Button variant="secondary" className="w-full" onClick={onExportDataRoom}>Datenraum exportieren</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack} className="w-full">
              Zurück
            </Button>
            <Button className="w-full" onClick={onSubmit}>Einreichen</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Dev tests
function DevTests() {
  type T = {
    name: string;
    input: { tender: Tender | null; missing: number; answers: Record<string, string>; mustPct: number };
    expect: (n: number) => boolean;
  };

  const baseTender: Tender = {
    id: "x",
    title: "Demo",
    buyer: "Buyer",
    region: "DE-SN",
    deadline: "2025-12-31",
    url: "",
    score: 80,
    legalRisks: [],
    mustHits: 8,
    mustTotal: 10,
    canHits: 5,
    canTotal: 10,
    serviceTypes: ["Unterhaltsreinigung"],
  };

  const okAnswers = Object.fromEntries(REQUIRED_Q.map((q) => [q.id, "ok"]));

  const tests: T[] = [
    {
      name: "Null tender → 0",
      input: { tender: null, missing: 0, answers: {}, mustPct: 80 },
      expect: (n) => n === 0,
    },
    {
      name: "No penalties gives sensible range",
      input: { tender: baseTender, missing: 0, answers: okAnswers, mustPct: 80 },
      expect: (n) => n >= 1 && n <= 99,
    },
    {
      name: "Docs missing reduce probability",
      input: { tender: baseTender, missing: 5, answers: okAnswers, mustPct: 80 },
      expect: (n) => n < computeWinProbability(baseTender, 0, okAnswers, 80),
    },
    {
      name: "Unanswered questions reduce probability",
      input: { tender: baseTender, missing: 0, answers: {}, mustPct: 80 },
      expect: (n) => n < computeWinProbability(baseTender, 0, okAnswers, 80),
    },
    {
      name: "Must% contributes a boost",
      input: { tender: baseTender, missing: 0, answers: okAnswers, mustPct: 100 },
      expect: (n) => n >= computeWinProbability(baseTender, 0, okAnswers, 60),
    },
  ];

  const results = tests.map((t) => {
    const n = computeWinProbability(t.input.tender, t.input.missing, t.input.answers, t.input.mustPct);
    return { name: t.name, pass: t.expect(n), value: n };
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Test Results</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {results.map((r, i) => (
          <div key={i} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${r.pass ? "" : "bg-red-50"}`}>
            <div>{r.name}</div>
            <div className={`inline-flex items-center gap-2 ${r.pass ? "text-sky-700" : "text-red-700"}`}>
              {r.pass ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span>{r.value}%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------- UI helpers
function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
      <span className="font-medium">{label}</span>
      <span className="opacity-70">{value}%</span>
    </span>
  );
}

function RiskList({ risks, risksWithSource, large = false }: { risks?: string[]; risksWithSource?: SourceInfo[]; large?: boolean }) {
  // Prefer risksWithSource if available
  if (risksWithSource && risksWithSource.length > 0) {
    const filtered = risksWithSource
      .filter((risk) => risk.text && !isPlaceholder(risk.text))
      .slice(0, 5);
    return (
      <div className={`grid ${large ? "gap-2" : "gap-1"}`}>
        {filtered.map((r, i) => (
          <div key={i} className={`inline-flex items-start gap-2 ${large ? "text-sm" : "text-xs"} text-amber-700`}>
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="line-clamp-2">{r.text}</div>
              <DocumentSourceInline
                source_document={r.source_document}
                source_chunk_id={r.source_chunk_id}
                page_number={r.page_number}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback to simple risks array (string or object)
  if (!risks?.length) return <span className="text-xs text-zinc-400">Keine Risiken erkannt</span>;
  return (
    <div className={`grid ${large ? "gap-2" : "gap-1"}`}>
      {risks.slice(0, 5).map((r, i) => {
        const text =
          typeof r === "string"
            ? r
            : (r?.risk_de || r?.risk || r?.text || "");
        if (!text || isPlaceholder(text)) return null;
        return (
          <span key={i} className={`inline-flex items-center gap-2 ${large ? "text-sm" : "text-xs"} text-amber-700`}>
            <AlertTriangle className="h-4 w-4" />
            <span className="line-clamp-2">{text}</span>
          </span>
        );
      })}
    </div>
  );
}

function Metric({ title, value, caption }: { title: string; value: string; caption?: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
      {caption && <div className="text-xs text-zinc-500">{caption}</div>}
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1">
      <label className="text-sm">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TagEditor({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...(tags || []), v]);
    setDraft("");
  };
  const remove = (i: number) => onChange(tags.filter((_, idx) => idx !== i));
  return (
    <div className="grid gap-2">
      <label className="text-sm">{label}</label>
      <div className="flex flex-wrap gap-2">
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
            {t}
            <button onClick={() => remove(i)} className="opacity-60 hover:opacity-100" aria-label={`Remove ${t}`}>
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nachweis hinzufügen" />
        <Button type="button" onClick={add}>
          <Plus className="mr-2 h-4 w-4" />Hinzufügen
        </Button>
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-1">
      <label className="text-sm">{label}</label>
      <Input type="number" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(parseFloat(e.target.value || "0"))} />
    </div>
  );
}
