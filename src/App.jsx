import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES, makeT } from './i18n.js';
import useWorkbench from './hooks/useWorkbench.js';
import useNotifications from './hooks/useNotifications.js';
import useTheme from './hooks/useTheme.js';
import TenderHeader from './components/TenderHeader.jsx';
import ThemeSwitch from './components/ThemeSwitch.jsx';
import UploadedFiles from './components/UploadedFiles.jsx';
import RequirementsList from './components/RequirementsList.jsx';
import SealPanel from './components/SealPanel.jsx';
import GenerateBar from './components/GenerateBar.jsx';
import { buildPackage } from './lib/buildPackage.js';
import { buildChecklistCsv, downloadBytes, downloadText } from './lib/csv.js';

const SAMPLE_REQUIREMENTS = {
  tender: {
    tender_id: 'DEMO-2026-014',
    title: 'Supply of Office Furniture and Equipment',
    procuring_entity: 'Dhaka North City Corporation',
    bidder: 'Example Trading Company',
    submission_deadline: '2026-11-30',
  },
  requirements: [
    {
      id: 'R1',
      order: 1,
      title_en: 'Trade License',
      title_bn: 'ট্রেড লাইসেন্স',
      mandatory: true,
      has_expiry: true,
    },
    {
      id: 'R2',
      order: 2,
      title_en: 'VAT Registration Certificate ( BIN )',
      title_bn: 'ভ্যাট নিবন্ধন সার্টিফিকেট ( বিআইএন )',
      mandatory: true,
      has_expiry: false,
    },
    {
      id: 'R3',
      order: 3,
      title_en: 'Bank Solvency Certificate',
      title_bn: 'ব্যাংক সলভেন্সি সার্টিফিকেট',
      mandatory: true,
      has_expiry: true,
    },
    {
      id: 'R4',
      order: 4,
      title_en: 'Income Tax Return ( last year )',
      title_bn: 'আয়কর রিটার্ন ( গত বছরের )',
      mandatory: false,
      has_expiry: false,
    },
    {
      id: 'R5',
      order: 5,
      title_en: 'Tender Security / Bank Guarantee',
      title_bn: 'টেন্ডার জামানত / ব্যাংক গ্যারান্টি',
      mandatory: false,
      has_expiry: true,
    },
  ],
};

export default function App() {
  const [lang, setLang] = useState(() => {
    const stored = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    return stored.toLowerCase().startsWith('bn') ? 'bn' : 'en';
  });
  const t = useMemo(() => makeT(lang), [lang]);
  const { notifications, notify, dismiss } = useNotifications(t);
  const { theme, setTheme } = useTheme();
  const workbench = useWorkbench(lang, t, notify);
  const {
    tender,
    requirements,
    requirementsById,
    loadedAt,
    files,
    filesById,
    matches,
    duplicates,
    checklist,
    summary,
    reasons,
    totalSize,
    hasTender,
    anyMatched,
    ready,
    includeIndex,
    setIncludeIndex,
    seal,
    loadSeal,
    clearSeal,
    setSealScope,
    setSealWidth,
    limits,
    restorable,
    rejected,
    dismissRejected,
    loadRequirementsText,
    loadRequirementsFile,
    addFiles,
    removeFile,
    clearFiles,
    setMatch,
    setExpiry,
    applySuggestions,
    restoreSession,
    reset,
    projectPayload,
    applyProject,
    downloadBaseName,
  } = workbench;

  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);

  // Keep the document language in sync for screen readers and font shaping.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const requirementsInput = useRef(null);
  const pdfInput = useRef(null);
  const projectInput = useRef(null);
  const resultUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  // Anything that changes what goes into the package (documents, matches,
  // expiry dates, index, seal) makes the previous download stale, so the
  // "package ready" banner disappears until the next build. Language is left
  // out on purpose: switching it changes no document.
  const buildSignature = JSON.stringify([
    includeIndex,
    seal ? [seal.name, seal.scope, seal.widthMm] : null,
    checklist.map((row) => [row.requirement.id, row.status, row.fileId || '', row.expiryDate || '']),
    tender ? tender.tender_id : null,
  ]);

  useEffect(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
  }, [buildSignature]);

  const downloadName = `${downloadBaseName}_Package.pdf`;

  const handleBrowsePdfs = useCallback(() => {
    pdfInput.current?.click();
  }, []);

  const handlePdfInput = useCallback(
    (event) => {
      const picked = event.target.files;
      if (picked && picked.length) addFiles(picked);
      // Reset so re-picking the same file fires change again.
      event.target.value = '';
    },
    [addFiles],
  );

  const handleRequirementsInput = useCallback(
    async (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) await loadRequirementsFile(file);
      event.target.value = '';
    },
    [loadRequirementsFile],
  );

  const handleProjectInput = useCallback(
    async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        if (applyProject(payload)) {
          if (payload.lang === 'bn' || payload.lang === 'en') setLang(payload.lang);
          notify('info', 'msg.projectLoaded');
        }
      } catch (error) {
        notify('bad', 'msg.projectInvalid', { detail: error.message });
      }
    },
    [applyProject, notify],
  );

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer?.files;
      if (!dropped || dropped.length === 0) return;
      const json = Array.from(dropped).find(
        (file) => /\.json$/i.test(file.name) || file.type === 'application/json',
      );
      if (json && !tender) {
        loadRequirementsFile(json);
        return;
      }
      addFiles(dropped);
    },
    [addFiles, loadRequirementsFile, tender],
  );

  const handleGenerate = useCallback(async () => {
    setProgress({ stage: 'reading', percent: 2 });
    try {
      const usableFiles = files.filter((file) => file.readState === 'ready' && file.data);
      const built = await buildPackage({
        tender,
        rows: checklist,
        files: usableFiles,
        includeIndex,
        seal,
        onProgress: setProgress,
      });
      const blob = new Blob([built.bytes], { type: 'application/pdf' });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({
        url,
        name: downloadName,
        pageCount: built.pageCount,
        entries: built.entries,
        seal: built.seal,
      });
      downloadBytes(built.bytes, downloadName, 'application/pdf');
      setProgress(null);
    } catch (error) {
      setProgress(null);
      notify('bad', 'msg.buildFailed', { detail: error.message });
    }
  }, [tender, checklist, files, includeIndex, seal, downloadName, notify]);

  const handleExportCsv = useCallback(() => {
    const csv = buildChecklistCsv({ checklist, tender, t, lang });
    downloadText(csv, `${downloadBaseName}_checklist.csv`, 'text/csv;charset=utf-8');
  }, [checklist, tender, t, lang, downloadBaseName]);

  const handleSaveProject = useCallback(() => {
    const payload = projectPayload();
    if (!payload) return;
    downloadText(
      JSON.stringify(payload, null, 2),
      `${downloadBaseName}_project.json`,
      'application/json;charset=utf-8',
    );
    notify('info', 'msg.projectSaved');
  }, [projectPayload, downloadBaseName, notify]);

  const loadSample = useCallback(async () => {
    await loadRequirementsText(JSON.stringify(SAMPLE_REQUIREMENTS), null);
  }, [loadRequirementsText]);

  return (
    <div
      className={`app${dragging ? ' app--dragging' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <a className="skiplink" href="#main">
        Skip to content
      </a>

      <header className="appbar">
        <div className="appbar__title">
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <div className="appbar__tools">
          <ThemeSwitch theme={theme} onThemeChange={setTheme} t={t} />
          <div
            className="langswitch"
            role="group"
            aria-label={t('app.languageHint')}
            title={t('app.languageHint')}
          >
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                className={`langswitch__btn${lang === option.code ? ' langswitch__btn--on' : ''}`}
                aria-pressed={lang === option.code}
                onClick={() => setLang(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="privacy">
        <span aria-hidden="true">🔒</span> {t('app.privacy')}
      </p>

      <div className="notices" aria-live="polite">
        {notifications.map((item) => (
          <div key={item.id} className={`notice notice--${item.tone}`} role="status">
            <span>{item.text}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => dismiss(item.id)}
              aria-label={t('msg.dismiss')}
            >
              ×
            </button>
          </div>
        ))}
        {rejected.map((item) => (
          <div
            key={item.id}
            className={`notice ${item.kind === 'notpdf' ? 'notice--warn' : 'notice--bad'}`}
            role={item.kind === 'notpdf' ? 'status' : 'alert'}
          >
            <span>
              {item.kind === 'encrypted'
                ? t('msg.pdfEncrypted', { name: item.name })
                : item.kind === 'broken'
                  ? t('msg.pdfBroken', { name: item.name })
                  : t('msg.notPdfOne', { name: item.name })}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => dismissRejected(item.id)}
              aria-label={t('msg.dismiss')}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {restorable && !tender ? (
        <div className="notice notice--info">
          <span>{t('msg.filesPlaceholder')}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => restoreSession(restorable)}>
            {t('msg.restoredSession')}
          </button>
        </div>
      ) : null}

      <main id="main" className="layout">
        <TenderHeader
          tender={tender}
          documentCount={requirements.length}
          t={t}
          lang={lang}
          loadedAt={loadedAt}
        />

        <section className="panel" aria-labelledby="load-heading">
          <h2 id="load-heading" className="panel__title">{t('step1.title')}</h2>
          <p className="panel__help">{t('step1.help')}</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => requirementsInput.current?.click()}
            >
              {tender ? t('step1.change') : t('step1.choose')}
            </button>
            {!tender ? (
              <button type="button" className="btn btn--ghost" onClick={loadSample}>
                {t('step1.loadSample')}
              </button>
            ) : null}
            {tender ? (
              <button type="button" className="btn btn--ghost" onClick={reset}>
                {t('tender.clear')}
              </button>
            ) : null}
          </div>
          <p className="muted">{t('step1.sampleNote')}</p>
        </section>

        <UploadedFiles
          files={files}
          matches={matches}
          filesById={filesById}
          requirementsById={requirementsById}
          duplicates={duplicates}
          totalSize={totalSize}
          limits={limits}
          onRemove={removeFile}
          onClearAll={clearFiles}
          onBrowse={handleBrowsePdfs}
          onDropFiles={(dropped) => {
            const json = Array.from(dropped).find(
              (file) => /\.json$/i.test(file.name) || file.type === 'application/json',
            );
            if (json && !tender) {
              loadRequirementsFile(json);
              return;
            }
            addFiles(dropped);
          }}
          t={t}
        />

        <RequirementsList
          rows={checklist}
          files={files.filter((file) => file.readState === 'ready')}
          matches={matches}
          duplicates={duplicates}
          requirementsById={requirementsById}
          deadline={workbench.deadline}
          lang={lang}
          onMatch={setMatch}
          onExpiryChange={setExpiry}
          onAutoMatch={applySuggestions}
          t={t}
        />

        {hasTender ? (
          <SealPanel
            seal={seal}
            onSelect={loadSeal}
            onRemove={clearSeal}
            onScopeChange={setSealScope}
            onWidthChange={setSealWidth}
            t={t}
          />
        ) : null}

        <GenerateBar
          summary={summary}
          reasons={reasons}
          ready={ready}
          includeIndex={includeIndex}
          onToggleIndex={setIncludeIndex}
          onGenerate={handleGenerate}
          onExportCsv={handleExportCsv}
          onSaveProject={handleSaveProject}
          onLoadProject={() => projectInput.current?.click()}
          progress={progress}
          result={result}
          downloadName={downloadName}
          hasTender={hasTender}
          hasMatchedFiles={anyMatched}
          t={t}
        />
      </main>

      <footer className="appfoot">
        <p className="muted">{t('footer.builtWith')}</p>
      </footer>

      <input
        ref={requirementsInput}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={handleRequirementsInput}
        tabIndex={-1}
      />
      <input
        ref={pdfInput}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handlePdfInput}
        tabIndex={-1}
      />
      <input
        ref={projectInput}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={handleProjectInput}
        tabIndex={-1}
      />

      {dragging ? (
        <div className="dragveil" aria-hidden="true">
          <p>{t('step2.dropHere')}</p>
        </div>
      ) : null}
    </div>
  );
}