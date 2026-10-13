import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database, Folder, Search, RefreshCw, ChevronRight, ChevronDown,
  Copy, Check, Download, List, Code, Table as TableIcon, Lock,
  SlidersHorizontal, Eye, X, Layers, Key as KeyIcon, FileCode
} from 'lucide-react';

/**
 * Convert an ISO timestamp into an ISO 8601 string in IST (+05:30):
 * e.g., "2026-09-25T20:35:18.487+05:30"
 */
function toIstIsoString(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  return istDate.toISOString().replace('Z', '+05:30');
}

/**
 * Format an ISO timestamp into MongoDB Atlas human-readable IST string:
 * e.g., "25 September 2026 at 20:35:18 IST"
 */
function formatHumanIstDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  const day = istDate.getUTCDate();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[istDate.getUTCMonth()];
  const year = istDate.getUTCFullYear();
  const hh = String(istDate.getUTCHours()).padStart(2, '0');
  const mm = String(istDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(istDate.getUTCSeconds()).padStart(2, '0');
  return `${day} ${month} ${year} at ${hh}:${mm}:${ss} IST`;
}

/**
 * Convert an Extended BSON document ({ $oid }, { $date }) into Mongo Shell BSON string
 * for the "Copy BSON" action
 */
function serializeToMongoShellBson(val, indent = 0) {
  const pad = '  '.repeat(indent);
  const childPad = '  '.repeat(indent + 1);

  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (typeof val === 'string') return JSON.stringify(val);

  if (typeof val === 'object') {
    if (val.$oid && Object.keys(val).length === 1) {
      return `ObjectId('${val.$oid}')`;
    }
    if (val.$date && Object.keys(val).length === 1) {
      return `ISODate('${toIstIsoString(val.$date)}')`;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const items = val.map(item => `${childPad}${serializeToMongoShellBson(item, indent + 1)}`);
      return `[\n${items.join(',\n')}\n${pad}]`;
    }
    const entries = Object.entries(val);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, v]) => {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return `${childPad}${safeKey}: ${serializeToMongoShellBson(v, indent + 1)}`;
    });
    return `{\n${lines.join(',\n')}\n${pad}}`;
  }
  return String(val);
}

/**
 * Recursive BSON Field/Value Row Renderer matching MongoDB Atlas Data Explorer
 * Uses MongoDB LeafyGreen 'Source Code Pro' monospace typography (12px / 18px line-height)
 */
function BsonFieldRow({ fieldKey, value, isArrayElement = false, depth = 0, forceExpandState = null }) {
  const isOid = value && typeof value === 'object' && value.$oid && Object.keys(value).length === 1;
  const isDate = value && typeof value === 'object' && value.$date && Object.keys(value).length === 1;
  const isArray = Array.isArray(value);
  const isPlainObject = value !== null && typeof value === 'object' && !isOid && !isDate && !isArray;

  // Default expand top-level nested objects/arrays up to depth 1 (just like MongoDB Atlas)
  const [expanded, setExpanded] = useState(depth < 2);
  const [textExpanded, setTextExpanded] = useState(false);

  useEffect(() => {
    if (forceExpandState === 'expand') setExpanded(true);
    else if (forceExpandState === 'collapse') setExpanded(false);
  }, [forceExpandState]);

  const indentPx = depth * 16;

  // Collapsible Object or Array node
  if (isArray || isPlainObject) {
    const entries = isArray
      ? value.map((v, idx) => [idx, v])
      : Object.entries(value);
    const typeLabel = isArray ? `Array (${entries.length})` : `Object (${entries.length})`;

    return (
      <div className="mongo-bson-mono" style={{ fontSize: '12px', lineHeight: '18px' }}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            paddingLeft: `${indentPx}px`,
            cursor: 'pointer',
            userSelect: 'none',
            borderRadius: '2px',
            paddingTop: '1px',
            paddingBottom: '1px'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <span style={{
            display: 'inline-block',
            width: '14px',
            color: '#3d4f58',
            fontSize: '10px',
            marginRight: '2px',
            flexShrink: 0
          }}>
            {expanded ? '▾' : '▸'}
          </span>
          <span style={{ color: '#001e2b', fontWeight: isArrayElement ? '500' : '600', marginRight: '6px' }}>
            {fieldKey}{isArrayElement ? ' :' : ':'}
          </span>
          <span style={{ color: '#3d4f58', fontWeight: '400' }}>
            {typeLabel}
          </span>
        </div>

        {expanded && entries.length > 0 && (
          <div>
            {entries.map(([childKey, childVal]) => (
              <BsonFieldRow
                key={String(childKey)}
                fieldKey={childKey}
                value={childVal}
                isArrayElement={isArray}
                depth={depth + 1}
                forceExpandState={forceExpandState}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Scalar BSON value rendering with exact MongoDB Atlas LeafyGreen colors & font weights
  let renderedValue = null;

  if (isOid) {
    renderedValue = (
      <span style={{ color: '#d83713', fontWeight: '400' }}>
        ObjectId(&apos;{value.$oid}&apos;)
      </span>
    );
  } else if (isDate) {
    const istIso = toIstIsoString(value.$date);
    const humanIst = formatHumanIstDate(value.$date);
    renderedValue = (
      <span>
        <span style={{ color: '#016bf8', fontWeight: '400' }}>
          ISODate(&apos;{istIso}&apos;)
        </span>
        {humanIst && (
          <span
            style={{
              marginLeft: '8px',
              color: '#001e2b',
              textDecoration: 'underline',
              textDecorationColor: '#889397',
              fontWeight: '400'
            }}
          >
            {humanIst}
          </span>
        )}
      </span>
    );
  } else if (typeof value === 'string') {
    const cleanOneLine = value.replace(/\r?\n/g, ' ');
    const isLongString = cleanOneLine.length > 140 || value.includes('\n');
    const displayStr = (!isLongString || textExpanded)
      ? value
      : `${cleanOneLine.slice(0, 140)}...`;

    renderedValue = (
      <span
        onClick={isLongString ? () => setTextExpanded(!textExpanded) : undefined}
        title={isLongString ? (textExpanded ? 'Click to collapse string' : 'Click to expand full string') : undefined}
        style={{
          color: '#00684a',
          fontWeight: '400',
          wordBreak: 'break-word',
          whiteSpace: textExpanded ? 'pre-wrap' : 'nowrap',
          cursor: isLongString ? 'pointer' : 'default'
        }}
      >
        &quot;{displayStr}&quot;
      </span>
    );
  } else if (typeof value === 'number') {
    renderedValue = (
      <span style={{ color: '#016bf8', fontWeight: '400' }}>
        {String(value)}
      </span>
    );
  } else if (typeof value === 'boolean') {
    renderedValue = (
      <span style={{ color: '#016bf8', fontWeight: '400' }}>
        {String(value)}
      </span>
    );
  } else if (value === null || value === undefined) {
    renderedValue = (
      <span style={{ color: '#5c6c75', fontWeight: '400' }}>
        null
      </span>
    );
  } else {
    renderedValue = (
      <span style={{ color: '#001e2b', fontWeight: '400' }}>
        {String(value)}
      </span>
    );
  }

  return (
    <div
      className="mongo-bson-mono"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        paddingLeft: `${indentPx + 16}px`,
        paddingTop: '1px',
        paddingBottom: '1px',
        fontSize: '12px',
        lineHeight: '18px',
        borderRadius: '2px',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span style={{
        color: '#001e2b',
        fontWeight: isArrayElement ? '500' : '600',
        marginRight: '6px',
        flexShrink: 0
      }}>
        {fieldKey}{isArrayElement ? ' :' : ':'}
      </span>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {renderedValue}
      </div>
    </div>
  );
}

/**
 * Single MongoDB Document Card (Read-Only) with Atlas Top-Right Copy/Inspect Toolbar
 */
function BsonDocumentCard({ bsonDoc, rawDoc, globalExpandCmd, onInspectDoc }) {
  const [cardExpandCmd, setCardExpandCmd] = useState(null);
  const [copiedType, setCopiedType] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  const effectiveExpandState = cardExpandCmd || globalExpandCmd;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rawDoc, null, 2));
    setCopiedType('json');
    setTimeout(() => setCopiedType(''), 1800);
  };

  const handleCopyBson = () => {
    navigator.clipboard.writeText(serializeToMongoShellBson(bsonDoc, 0));
    setCopiedType('bson');
    setTimeout(() => setCopiedType(''), 1800);
  };

  const toggleAllInCard = () => {
    setCardExpandCmd(prev => (prev === 'expand' ? 'collapse' : 'expand'));
  };

  const entries = Object.entries(bsonDoc || {});

  return (
    <div
      className="mongo-bson-mono"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        backgroundColor: '#ffffff',
        border: `1px solid ${isHovered ? '#889397' : '#e8edeb'}`,
        borderRadius: '6px',
        padding: '12px 16px 12px 42px',
        marginBottom: '8px',
        transition: 'border-color 0.12s ease'
      }}
    >
      {/* Top-Left Expand/Collapse Card Caret Button (Matching Atlas) */}
      <button
        type="button"
        onClick={toggleAllInCard}
        title="Expand / Collapse nested fields in this document"
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          width: '22px',
          height: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #c1c7c6',
          borderRadius: '4px',
          backgroundColor: '#f9fbfa',
          color: '#1c2d38',
          cursor: 'pointer',
          fontSize: '10px',
          padding: 0
        }}
      >
        {effectiveExpandState === 'collapse' ? '▸' : '▾'}
      </button>

      {/* Top-Right Read-Only Action Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          opacity: isHovered || copiedType ? 1 : 0.85,
          transition: 'opacity 0.15s ease',
          backgroundColor: '#ffffff',
          padding: '2px 4px',
          borderRadius: '4px'
        }}
      >
        <button
          type="button"
          onClick={handleCopyJson}
          title="Copy formatted JSON"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 7px',
            border: '1px solid #c1c7c6',
            borderRadius: '4px',
            backgroundColor: copiedType === 'json' ? '#e3fcf7' : '#f9fbfa',
            color: copiedType === 'json' ? '#00684a' : '#1c2d38',
            fontSize: '11px',
            cursor: 'pointer'
          }}
        >
          {copiedType === 'json' ? <Check size={12} /> : <Copy size={12} />}
          {copiedType === 'json' ? 'Copied' : 'JSON'}
        </button>

        <button
          type="button"
          onClick={handleCopyBson}
          title="Copy Mongo Shell BSON (with ObjectId & ISODate)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 7px',
            border: '1px solid #c1c7c6',
            borderRadius: '4px',
            backgroundColor: copiedType === 'bson' ? '#e3fcf7' : '#f9fbfa',
            color: copiedType === 'bson' ? '#00684a' : '#1c2d38',
            fontSize: '11px',
            cursor: 'pointer'
          }}
        >
          {copiedType === 'bson' ? <Check size={12} /> : <FileCode size={12} />}
          {copiedType === 'bson' ? 'Copied' : 'BSON'}
        </button>

        <button
          type="button"
          onClick={() => onInspectDoc(bsonDoc, rawDoc)}
          title="Inspect full document in modal"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '25px',
            height: '25px',
            border: '1px solid #c1c7c6',
            borderRadius: '4px',
            backgroundColor: '#f9fbfa',
            color: '#1c2d38',
            cursor: 'pointer'
          }}
        >
          <Eye size={13} />
        </button>
      </div>

      {/* Document Fields */}
      <div>
        {entries.map(([k, v]) => (
          <BsonFieldRow
            key={k}
            fieldKey={k}
            value={v}
            isArrayElement={false}
            depth={0}
            forceExpandState={effectiveExpandState}
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminDatabaseViewer({ API_BASE }) {
  // Cluster & Collection Tree State
  const [clusterName, setClusterName] = useState('BICS');
  const [databaseName, setDatabaseName] = useState('test');
  const [collections, setCollections] = useState([]);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [clusterExpanded, setClusterExpanded] = useState(true);
  const [dbExpanded, setDbExpanded] = useState(true);
  const [loadingCollections, setLoadingCollections] = useState(false);

  // Active Tab ('documents' | 'schema' | 'indexes')
  const [activeTab, setActiveTab] = useState('documents');

  // Query & Pagination State
  const [filterInput, setFilterInput] = useState('');
  const [sortInput, setSortInput] = useState('{ _id: -1 }');
  const [projectionInput, setProjectionInput] = useState('');
  const [showQueryOptions, setShowQueryOptions] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Documents Data State
  const [documents, setDocuments] = useState([]);
  const [bsonDocuments, setBsonDocuments] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [queryError, setQueryError] = useState('');

  // Schema & Indexes State
  const [indexes, setIndexes] = useState([]);
  const [schemaFields, setSchemaFields] = useState([]);
  const [schemaSampleSize, setSchemaSampleSize] = useState(0);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // View Mode ('list' | 'json' | 'table') & Global Expand/Collapse
  const [viewMode, setViewMode] = useState('list');
  const [globalExpandCmd, setGlobalExpandCmd] = useState(null);
  const [inspectedDoc, setInspectedDoc] = useState(null);

  // 1. Load all collections on mount
  const fetchCollectionsList = useCallback(async (keepSelection = true) => {
    setLoadingCollections(true);
    const start = Date.now();
    try {
      const res = await fetch(`${API_BASE}/admin/db/collections`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.collections)) {
        setClusterName(data.clusterName || 'BICS');
        setDatabaseName(data.databaseName || 'test');
        setCollections(data.collections);
        if (!keepSelection || !selectedCollection) {
          // Prefer videolectures if present, otherwise first collection
          const preferred = data.collections.find(c => c.name === 'videolectures') || data.collections[0];
          if (preferred) {
            setSelectedCollection(preferred.name);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch DB collections:', err);
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      setLoadingCollections(false);
    }
  }, [API_BASE, selectedCollection]);

  useEffect(() => {
    fetchCollectionsList(false);
  }, []);

  // 2. Fetch documents for the active collection
  const fetchCollectionDocuments = useCallback(async (targetCol, targetPage = page, targetLimit = limit, customFilter = filterInput, customSort = sortInput, customProj = projectionInput) => {
    if (!targetCol) return;
    setLoadingDocs(true);
    setQueryError('');
    const start = Date.now();
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(targetLimit)
      });
      if (customFilter && customFilter.trim()) params.set('filter', customFilter.trim());
      if (customSort && customSort.trim()) params.set('sort', customSort.trim());
      if (customProj && customProj.trim()) params.set('projection', customProj.trim());

      const res = await fetch(`${API_BASE}/admin/db/collections/${encodeURIComponent(targetCol)}/documents?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setQueryError(data.error || 'Query execution error');
        return;
      }
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setBsonDocuments(Array.isArray(data.bsonDocuments) ? data.bsonDocuments : []);
      setTotalCount(Number(data.totalCount) || 0);
      setTotalPages(Number(data.totalPages) || 1);
      setStartIndex(Number(data.startIndex) || 0);
      setEndIndex(Number(data.endIndex) || 0);
      setGlobalExpandCmd(null);
    } catch (err) {
      setQueryError(err.message || 'Network error while querying MongoDB');
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      setLoadingDocs(false);
    }
  }, [API_BASE, page, limit, filterInput, sortInput, projectionInput]);

  // 3. Fetch indexes & schema when switching collection or opening Schema/Indexes tab
  const fetchCollectionMeta = useCallback(async (targetCol) => {
    if (!targetCol) return;
    setLoadingMeta(true);
    try {
      const res = await fetch(`${API_BASE}/admin/db/collections/${encodeURIComponent(targetCol)}/indexes`);
      const data = await res.json();
      if (res.ok) {
        setIndexes(Array.isArray(data.indexes) ? data.indexes : []);
        setSchemaFields(Array.isArray(data.schemaFields) ? data.schemaFields : []);
        setSchemaSampleSize(Number(data.sampleSize) || 0);
      }
    } catch (e) {
      console.error('Failed to fetch collection metadata:', e);
    } finally {
      setLoadingMeta(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    if (selectedCollection) {
      fetchCollectionDocuments(selectedCollection, page, limit, filterInput, sortInput, projectionInput);
      fetchCollectionMeta(selectedCollection);
    }
  }, [selectedCollection, page, limit]);

  const handleSelectCollection = (colName) => {
    if (colName === selectedCollection) return;
    setSelectedCollection(colName);
    setPage(1);
    setFilterInput('');
    setProjectionInput('');
    setQueryError('');
  };

  const handleRunFind = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    fetchCollectionDocuments(selectedCollection, 1, limit, filterInput, sortInput, projectionInput);
  };

  const handleResetQuery = () => {
    setFilterInput('');
    setSortInput('{ _id: -1 }');
    setProjectionInput('');
    setQueryError('');
    setPage(1);
    fetchCollectionDocuments(selectedCollection, 1, limit, '', '{ _id: -1 }', '');
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(documents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ databaseName }_${ selectedCollection }_page${ page }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCollections = useMemo(() => {
    if (!collectionSearch.trim()) return collections;
    const q = collectionSearch.toLowerCase();
    return collections.filter(c => c.name.toLowerCase().includes(q));
  }, [collections, collectionSearch]);

  // Discover all columns for Table View
  const tableColumns = useMemo(() => {
    const cols = new Set();
    documents.forEach(doc => {
      Object.keys(doc || {}).forEach(k => cols.add(k));
    });
    return Array.from(cols);
  }, [documents]);

  const activeColMeta = collections.find(c => c.name === selectedCollection);

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 115px)',
      minHeight: '640px',
      backgroundColor: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)'
    }}>
      {/* LEFT SIDEBAR: CLUSTERS -> DATABASE -> COLLECTIONS TREE */}
      <div style={{
        width: '265px',
        flexShrink: 0,
        borderRight: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '12px 14px 8px 14px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#ffffff'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px'
          }}>
            <span style={{
              fontSize: '8pt',
              fontWeight: '700',
              letterSpacing: '0.6px',
              color: '#334155',
              textTransform: 'uppercase'
            }}>
              CLUSTERS (1)
            </span>
            <button
              type="button"
              onClick={() => fetchCollectionsList(true)}
              title="Refresh collections list"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <RefreshCw size={13} className={loadingCollections ? 'spin' : ''} />
            </button>
          </div>

          {/* Search Collections Input */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', color: '#64748b' }} />
            <input
              type="text"
              value={collectionSearch}
              onChange={(e) => setCollectionSearch(e.target.value)}
              placeholder="Search collections..."
              style={{
                width: '100%',
                padding: '6px 26px 6px 28px',
                fontSize: '8.5pt',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                outline: 'none'
              }}
            />
            {collectionSearch && (
              <button
                type="button"
                onClick={() => setCollectionSearch('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Cluster -> DB -> Collection Tree */}
        <div
          className="mongo-bson-mono"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 6px',
            fontSize: '12px'
          }}
        >
          {/* Cluster Root Node */}
          <div
            onClick={() => setClusterExpanded(!clusterExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 8px',
              cursor: 'pointer',
              color: '#0f172a',
              fontWeight: '700',
              borderRadius: '4px'
            }}
          >
            {clusterExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Layers size={14} style={{ color: '#00684a' }} />
            <span>{clusterName}</span>
          </div>

          {clusterExpanded && (
            <div style={{ paddingLeft: '14px' }}>
              {/* Database Node */}
              <div
                onClick={() => setDbExpanded(!dbExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  color: '#1e293b',
                  fontWeight: '600',
                  borderRadius: '4px'
                }}
              >
                {dbExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Database size={13} style={{ color: '#334155' }} />
                <span>{databaseName}</span>
              </div>

              {/* Collections List */}
              {dbExpanded && (
                <div style={{ paddingLeft: '14px', marginTop: '2px' }}>
                  {filteredCollections.map((col) => {
                    const isSelected = col.name === selectedCollection;
                    return (
                      <div
                        key={col.name}
                        onClick={() => handleSelectCollection(col.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          padding: '6px 8px',
                          marginBottom: '1px',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? '#e8f5e9' : 'transparent',
                          color: isSelected ? '#00684a' : '#334155',
                          fontWeight: isSelected ? '700' : '500',
                          borderLeft: isSelected ? '3px solid #00684a' : '3px solid transparent'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                          <Folder
                            size={13}
                            style={{
                              color: isSelected ? '#00684a' : '#475569',
                              fill: isSelected ? '#00684a' : '#475569',
                              flexShrink: 0
                            }}
                          />
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {col.name}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          color: isSelected ? '#00684a' : '#64748b',
                          backgroundColor: isSelected ? '#dcfce7' : '#e2e8f0',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          fontWeight: '600',
                          flexShrink: 0
                        }}>
                          {col.count}
                        </span>
                      </div>
                    );
                  })}

                  {filteredCollections.length === 0 && !loadingCollections && (
                    <div style={{ padding: '12px 8px', color: '#94a3b8', fontSize: '11px' }}>
                      No matching collections
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Status Bar (Matching Atlas "Alert System Status: All Good") */}
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          fontSize: '8pt',
          color: '#475569',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>
            DB Mode: <strong style={{ color: '#00684a' }}>All Good</strong>
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: '#64748b',
            fontWeight: '600'
          }}>
            <Lock size={11} /> Read-Only
          </span>
        </div>
      </div>

      {/* RIGHT MAIN WORKSPACE */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        backgroundColor: '#ffffff'
      }}>
        {/* Top Collection Header & Tabs Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          minHeight: '46px'
        }}>
          {/* Tabs: Documents | Schema | Indexes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('documents')}
              style={{
                padding: '12px 2px',
                border: 'none',
                borderBottom: activeTab === 'documents' ? '3px solid #00684a' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'documents' ? '#00684a' : '#475569',
                fontWeight: activeTab === 'documents' ? '700' : '500',
                fontSize: '9.5pt',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Documents</span>
              <span
                className="mongo-bson-mono"
                style={{
                  backgroundColor: activeTab === 'documents' ? '#dcfce7' : '#f1f5f9',
                  color: activeTab === 'documents' ? '#00684a' : '#475569',
                  fontSize: '11px',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontWeight: '700'
                }}
              >
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('schema')}
              style={{
                padding: '12px 2px',
                border: 'none',
                borderBottom: activeTab === 'schema' ? '3px solid #00684a' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'schema' ? '#00684a' : '#475569',
                fontWeight: activeTab === 'schema' ? '700' : '500',
                fontSize: '9.5pt',
                cursor: 'pointer'
              }}
            >
              Schema
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('indexes')}
              style={{
                padding: '12px 2px',
                border: 'none',
                borderBottom: activeTab === 'indexes' ? '3px solid #00684a' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'indexes' ? '#00684a' : '#475569',
                fontWeight: activeTab === 'indexes' ? '700' : '500',
                fontSize: '9.5pt',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Indexes</span>
              <span
                className="mongo-bson-mono"
                style={{
                  backgroundColor: activeTab === 'indexes' ? '#dcfce7' : '#f1f5f9',
                  color: activeTab === 'indexes' ? '#00684a' : '#475569',
                  fontSize: '11px',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontWeight: '700'
                }}
              >
                {indexes.length || activeColMeta?.indexCount || 1}
              </span>
            </button>
          </div>

          {/* Collection Path & Read-Only Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="mongo-bson-mono"
              style={{
                fontSize: '12px',
                color: '#475569'
              }}
            >
              <strong>{databaseName}</strong>.{selectedCollection}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '7.5pt',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '12px'
            }}>
              <Lock size={11} style={{ color: '#00684a' }} />
              READ-ONLY VIEWER
            </span>
          </div>
        </div>

        {/* TAB 1: DOCUMENTS VIEW */}
        {activeTab === 'documents' && (
          <>
            {/* Query & Filter Bar (Matching MongoDB Atlas) */}
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#fcfcfd'
            }}>
              <form
                onSubmit={handleRunFind}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  padding: '5px 10px'
                }}
              >
                <span
                  className="mongo-bson-mono"
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#64748b',
                    paddingRight: '4px'
                  }}
                >
                  FILTER
                </span>
                <input
                  type="text"
                  className="mongo-bson-mono"
                  value={filterInput}
                  onChange={(e) => setFilterInput(e.target.value)}
                  placeholder="Type a query: { field: 'value' } or keyword..."
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    color: '#001e2b',
                    backgroundColor: 'transparent'
                  }}
                />
                <button
                  type="button"
                  onClick={handleResetQuery}
                  style={{
                    padding: '5px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    fontSize: '8.5pt',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '5px 14px',
                    border: '1px solid #00684a',
                    borderRadius: '4px',
                    backgroundColor: '#00684a',
                    color: '#ffffff',
                    fontSize: '8.5pt',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Find
                </button>
                <button
                  type="button"
                  onClick={() => setShowQueryOptions(!showQueryOptions)}
                  style={{
                    padding: '5px 8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#006cfa',
                    fontSize: '8.5pt',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>Options</span>
                  {showQueryOptions ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              </form>

              {/* Expandable Sort & Projection Options Row */}
              {showQueryOptions && (
                <div
                  className="mongo-bson-mono"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginTop: '8px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    backgroundColor: '#ffffff',
                    padding: '5px 10px'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>
                      SORT
                    </span>
                    <input
                      type="text"
                      value={sortInput}
                      onChange={(e) => setSortInput(e.target.value)}
                      placeholder="{ _id: -1 } or { createdAt: -1 }"
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: '12px',
                        color: '#001e2b'
                      }}
                    />
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    backgroundColor: '#ffffff',
                    padding: '5px 10px'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>
                      PROJECT
                    </span>
                    <input
                      type="text"
                      value={projectionInput}
                      onChange={(e) => setProjectionInput(e.target.value)}
                      placeholder="{ fieldName: 1 } or { largeField: 0 }"
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: '12px',
                        color: '#001e2b'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Error Banner if query syntax is invalid */}
              {queryError && (
                <div
                  className="mongo-bson-mono"
                  style={{
                    marginTop: '8px',
                    padding: '7px 12px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '5px',
                    color: '#b91c1c',
                    fontSize: '11.5px'
                  }}
                >
                  {queryError}
                </div>
              )}

              {/* Toolbar Row: Export, Expand/Collapse All, Pagination, View Mode Switcher */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '10px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                {/* Left Utility Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    disabled={documents.length === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      fontSize: '8pt',
                      fontWeight: '600',
                      cursor: documents.length === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Download size={12} /> EXPORT JSON
                  </button>

                  {viewMode === 'list' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setGlobalExpandCmd('expand')}
                        style={{
                          padding: '5px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          fontSize: '8pt',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        ▾ EXPAND ALL
                      </button>
                      <button
                        type="button"
                        onClick={() => setGlobalExpandCmd('collapse')}
                        style={{
                          padding: '5px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          fontSize: '8pt',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        ▸ COLLAPSE ALL
                      </button>
                    </>
                  )}
                </div>

                {/* Right Pagination & View Mode Switcher (Matching Atlas Toolbar) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <select
                    className="mongo-bson-mono"
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontSize: '11.5px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>

                  <span
                    className="mongo-bson-mono"
                    style={{
                      fontSize: '11.5px',
                      color: '#334155'
                    }}
                  >
                    {startIndex} – {endIndex} of {totalCount}
                  </span>

                  <button
                    type="button"
                    onClick={() => fetchCollectionDocuments(selectedCollection, page, limit, filterInput, sortInput, projectionInput)}
                    title="Refresh live documents from MongoDB"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#334155',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <RefreshCw size={14} className={loadingDocs ? 'spin' : ''} />
                  </button>

                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: page <= 1 ? '#cbd5e1' : '#334155',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                      padding: '3px 7px',
                      fontSize: '9pt'
                    }}
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      color: page >= totalPages ? '#cbd5e1' : '#334155',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                      padding: '3px 7px',
                      fontSize: '9pt'
                    }}
                  >
                    &gt;
                  </button>

                  {/* 3-Way View Mode Toggle: List | JSON | Table */}
                  <div style={{
                    display: 'inline-flex',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    overflow: 'hidden'
                  }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      title="BSON List / Tree View"
                      style={{
                        padding: '5px 9px',
                        border: 'none',
                        backgroundColor: viewMode === 'list' ? '#001e2b' : '#ffffff',
                        color: viewMode === 'list' ? '#ffffff' : '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <List size={13} />
                    </button>
                    <button
                      type="button"
                      className="mongo-bson-mono"
                      onClick={() => setViewMode('json')}
                      title="Raw JSON View"
                      style={{
                        padding: '5px 9px',
                        border: 'none',
                        borderLeft: '1px solid #cbd5e1',
                        borderRight: '1px solid #cbd5e1',
                        backgroundColor: viewMode === 'json' ? '#001e2b' : '#ffffff',
                        color: viewMode === 'json' ? '#ffffff' : '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '11px',
                        fontWeight: '700'
                      }}
                    >
                      {'{}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      title="Table Grid View"
                      style={{
                        padding: '5px 9px',
                        border: 'none',
                        backgroundColor: viewMode === 'table' ? '#001e2b' : '#ffffff',
                        color: viewMode === 'table' ? '#ffffff' : '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <TableIcon size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Documents Scroll Canvas */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 20px',
              backgroundColor: '#f8fafc'
            }}>
              {loadingDocs ? (
                <div
                  className="mongo-bson-mono"
                  style={{
                    padding: '48px 20px',
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: '12px'
                  }}
                >
                  Loading documents from {databaseName}.{selectedCollection}...
                </div>
              ) : bsonDocuments.length === 0 ? (
                <div
                  className="mongo-bson-mono"
                  style={{
                    padding: '48px 20px',
                    textAlign: 'center',
                    backgroundColor: '#ffffff',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '6px',
                    color: '#64748b',
                    fontSize: '12px'
                  }}
                >
                  No documents found in <strong>{databaseName}.{selectedCollection}</strong> matching the current filter.
                </div>
              ) : viewMode === 'list' ? (
                bsonDocuments.map((bDoc, idx) => (
                  <BsonDocumentCard
                    key={bDoc?._id?.$oid || bDoc?._id || idx}
                    bsonDoc={bDoc}
                    rawDoc={documents[idx] || bDoc}
                    globalExpandCmd={globalExpandCmd}
                    onInspectDoc={(bson, raw) => setInspectedDoc({ bson, raw })}
                  />
                ))
              ) : viewMode === 'json' ? (
                bsonDocuments.map((bDoc, idx) => (
                  <div
                    key={bDoc?._id?.$oid || idx}
                    className="mongo-bson-mono"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      marginBottom: '10px',
                      fontSize: '12px',
                      lineHeight: '18px',
                      color: '#001e2b',
                      whiteSpace: 'pre-wrap',
                      overflowX: 'auto'
                    }}
                  >
                    {serializeToMongoShellBson(bDoc, 0)}
                  </div>
                ))
              ) : (
                /* Table View */
                <div
                  className="mongo-bson-mono"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    overflowX: 'auto'
                  }}
                >
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '11.5px'
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                        {tableColumns.map(col => (
                          <th
                            key={col}
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              color: '#001e2b',
                              fontWeight: '700',
                              borderRight: '1px solid #e2e8f0',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bsonDocuments.map((bDoc, rIdx) => (
                        <tr
                          key={bDoc?._id?.$oid || rIdx}
                          style={{ borderBottom: '1px solid #e2e8f0' }}
                        >
                          {tableColumns.map(col => {
                            const val = bDoc?.[col];
                            let cellDisplay = '';
                            let cellColor = '#334155';
                            if (val === undefined || val === null) {
                              cellDisplay = 'null';
                              cellColor = '#94a3b8';
                            } else if (val?.$oid) {
                              cellDisplay = `ObjectId('${val.$oid}')`;
                              cellColor = '#d83713';
                            } else if (val?.$date) {
                              cellDisplay = `${formatHumanIstDate(val.$date)} (${toIstIsoString(val.$date)})`;
                              cellColor = '#016bf8';
                            } else if (Array.isArray(val)) {
                              cellDisplay = `Array (${val.length})`;
                              cellColor = '#3d4f58';
                            } else if (typeof val === 'object') {
                              cellDisplay = `Object (${Object.keys(val).length})`;
                              cellColor = '#3d4f58';
                            } else if (typeof val === 'string') {
                              cellDisplay = val.length > 70 ? `"${val.slice(0, 70)}..."` : `"${val}"`;
                              cellColor = '#00684a';
                            } else if (typeof val === 'number') {
                              cellDisplay = String(val);
                              cellColor = '#016bf8';
                            } else if (typeof val === 'boolean') {
                              cellDisplay = String(val);
                              cellColor = '#016bf8';
                            }
                            return (
                              <td
                                key={col}
                                style={{
                                  padding: '7px 12px',
                                  color: cellColor,
                                  borderRight: '1px solid #f1f5f9',
                                  maxWidth: '280px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {cellDisplay}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: SCHEMA VIEW */}
        {activeTab === 'schema' && (
          <div className="mongo-bson-mono" style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f8fafc' }}>
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '16px'
            }}>
              <div style={{ marginBottom: '12px', fontSize: '12px', color: '#334155' }}>
                Inferred BSON Schema for <strong>{databaseName}.{selectedCollection}</strong> (sampled across {schemaSampleSize} documents):
              </div>
              {loadingMeta ? (
                <div style={{ padding: '20px', color: '#64748b', fontSize: '12px' }}>
                  Analyzing schema fields...
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>Field Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>BSON Type(s)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>Presence</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>Sample Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemaFields.map(f => (
                      <tr key={f.field} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600', color: '#001e2b' }}>{f.field}</td>
                        <td style={{ padding: '8px 12px', color: '#016bf8' }}>{f.types.join(' | ')}</td>
                        <td style={{ padding: '8px 12px', color: '#00684a', fontWeight: '600' }}>{f.frequencyPercent}%</td>
                        <td style={{ padding: '8px 12px', color: '#475569', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.sampleValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: INDEXES VIEW */}
        {activeTab === 'indexes' && (
          <div className="mongo-bson-mono" style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f8fafc' }}>
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '16px'
            }}>
              <div style={{ marginBottom: '12px', fontSize: '12px', color: '#334155' }}>
                Active MongoDB Indexes on <strong>{databaseName}.{selectedCollection}</strong>:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>Index Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>Key Specification</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#001e2b' }}>Properties</th>
                  </tr>
                </thead>
                <tbody>
                  {indexes.map((idx, i) => (
                    <tr key={idx.name || i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: '600', color: '#001e2b' }}>
                        <KeyIcon size={12} style={{ marginRight: '6px', color: '#00684a', verticalAlign: 'middle' }} />
                        {idx.name}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#016bf8' }}>
                        {JSON.stringify(idx.key)}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>
                        {idx.name === '_id_' ? 'UNIQUE • PRIMARY' : idx.unique ? 'UNIQUE' : 'STANDARD'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* FULL DOCUMENT INSPECTOR MODAL (Read-Only) */}
      {inspectedDoc && (
        <div
          onClick={() => setInspectedDoc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '86vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
              border: '1px solid #cbd5e1',
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div className="mongo-bson-mono" style={{ fontSize: '12.5px', fontWeight: '700', color: '#001e2b' }}>
                Document Inspector — {databaseName}.{selectedCollection}
              </div>
              <button
                type="button"
                onClick={() => setInspectedDoc(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              backgroundColor: '#ffffff'
            }}>
              {Object.entries(inspectedDoc.bson || {}).map(([k, v]) => (
                <BsonFieldRow
                  key={k}
                  fieldKey={k}
                  value={v}
                  isArrayElement={false}
                  depth={0}
                  forceExpandState="expand"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
