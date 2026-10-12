import { Fragment, useEffect, useRef, useState } from 'react';
import { renderFirstPage } from '../lib/pdfRead.js';

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Wrapping hint after every _, - and . so a narrow screen breaks the name at
 * "02_technical_" / "proposal.pdf" instead of inside a word.
 */
function FileName({ name }) {
  const parts = name.split(/([._-])/);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index % 2 === 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}

/** First page preview, rendered on demand so opening the list stays fast. */
function Thumbnail({ file, t }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | ready | failed
  // Keep the in-flight render outside state so a re-render (or StrictMode's
  // double mount in development) cannot leave the preview stuck on "loading".
  const inFlight = useRef(null);

  useEffect(() => {
    if (!open) {
      inFlight.current = null;
      return;
    }
    if (url || state === 'failed' || inFlight.current) return;
    const token = {};
    inFlight.current = token;
    setState('loading');
    renderFirstPage(file.data).then((result) => {
      if (inFlight.current !== token) return;
      inFlight.current = null;
      if (result) {
        setUrl(result);
        setState('ready');
      } else {
        setState('failed');
      }
    });
  }, [open, url, state, file.data]);

  useEffect(() => () => {
    inFlight.current = null;
  }, []);

  if (file.readState !== 'ready') return null;

  return (
    <div className="thumb">
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('step2.preview')}
      </button>
      {open ? (
        <div className="thumb__panel">
          {url ? (
            <img className="thumb__img" src={url} alt={`${t('step2.previewFirstPage')}: ${file.name}`} />
          ) : (
            <p className="muted">{state === 'failed' ? t('step2.previewError') : t('step2.reading')}</p>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
            {t('step2.closePreview')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function UploadedFiles({
  files,
  matches,
  filesById,
  requirementsById,
  duplicates,
  totalSize,
  limits,
  onRemove,
  onClearAll,
  onBrowse,
  onDropFiles,
  t,
}) {
  const duplicateGroups = duplicates.filter((group) => group.length > 1);

  return (
    <section className="panel" aria-labelledby="files-heading">
      <div className="panel__head">
        <h2 id="files-heading" className="panel__title">
          {t('step2.title')}
        </h2>
        {files.length > 0 ? (
          <span className="chip">
            {t('step2.fileCount', { count: files.length })} · {formatSize(totalSize)}
          </span>
        ) : null}
      </div>

      <p className="panel__help">{t('step2.limits', { maxFiles: limits.maxFiles, maxSize: limits.maxSizeMb })}</p>

      <div
        className="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dropped = Array.from(event.dataTransfer?.files || []);
          if (dropped.length) onDropFiles(dropped);
        }}
      >
        <p className="dropzone__text">
          {t('step2.dropHere')}
          <span className="muted"> — {t('step2.dropAnywhere')}</span>
        </p>
        <div className="dropzone__actions">
          <button type="button" className="btn btn--primary" onClick={onBrowse}>
            {t('step2.choose')}
          </button>
          {files.length > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={onClearAll}>
              {t('step2.clearAll')}
            </button>
          ) : null}
        </div>
      </div>

      {duplicateGroups.length > 0 ? (
        <p className="notice notice--warn" role="status">
          {t('step2.duplicateHint')}
        </p>
      ) : null}

      {files.length === 0 ? (
        <p className="muted">{t('step2.empty')}</p>
      ) : (
        <ul className="filelist">
          {files.map((file) => {
            const matchedRequirementId = Object.keys(matches).find((id) => matches[id] === file.id);
            const matchedTitle = matchedRequirementId
              ? requirementsById[matchedRequirementId]?.displayTitle
              : null;
            const duplicateNames = duplicates
              .find((group) => group.includes(file.id))
              ?.filter((id) => id !== file.id)
              .map((id) => filesById[id]?.name)
              .filter(Boolean);

            return (
              <li key={file.id} className="file">
                <div className="file__main">
                  <span className="file__name" title={file.name}>
                    <FileName name={file.name} />
                  </span>
                  <span className="file__meta">
                    {file.readState === 'ready'
                      ? t('step2.pages', { count: file.pageCount })
                      : file.readState === 'error'
                        ? '—'
                        : t('step2.reading')}
                    {file.size ? ` · ${t('step2.size', { size: formatSize(file.size) })}` : ''}
                  </span>
                </div>
                <div className="file__tags">
                  {file.readState === 'error' ? (
                    <span className="badge badge--bad">
                      <span className="badge__icon" aria-hidden="true">✕</span>
                      <span className="badge__text">
                        {file.readError === 'encrypted' ? t('step2.encrypted') : t('step2.broken')}
                      </span>
                    </span>
                  ) : null}
                  {duplicateNames && duplicateNames.length > 0 ? (
                    <span
                      className="badge badge--warn"
                      title={t('step2.duplicateOf', { names: duplicateNames.join(', ') })}
                    >
                      <span className="badge__icon" aria-hidden="true">=</span>
                      <span className="badge__text">{t('step2.duplicate')}</span>
                    </span>
                  ) : null}
                  {matchedTitle ? (
                    <span className="badge badge--ok">
                      <span className="badge__icon" aria-hidden="true">✓</span>
                      <span className="badge__text">
                        {t('step2.matchedTo', { title: matchedTitle })}
                      </span>
                    </span>
                  ) : (
                    <span className="badge badge--neutral">
                      <span className="badge__icon" aria-hidden="true">–</span>
                      <span className="badge__text">{t('step2.notMatched')}</span>
                    </span>
                  )}
                </div>
                <div className="file__actions">
                  <Thumbnail file={file} t={t} />
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => onRemove(file.id)}
                    aria-label={t('step2.removeAria', { name: file.name })}
                  >
                    {t('step2.remove')}
                  </button>
                </div>
                <span className="sr-only">{t('step2.hashShort', { hash: (file.hash || '').slice(0, 8) })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}