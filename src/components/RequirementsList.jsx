import MatchSelect from './MatchSelect.jsx';
import StatusBadge from './StatusBadge.jsx';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { formatISODateForDisplay, isValidISODate } from '../lib/dates.js';
import { nameMatchScore } from '../lib/matchSuggestions.js';

/**
 * One row per required document: match dropdown, expiry date, status.
 * Everything the user can change sits in the same row so the status next to it
 * is obviously the result of that control.
 *
 * Matching itself is automatic (by file name, see useWorkbench); the button
 * re-runs it and the dropdown is for anything it got wrong.
 */
export default function RequirementsList({
  rows,
  files,
  matches,
  duplicates,
  requirementsById,
  deadline,
  lang,
  onMatch,
  onExpiryChange,
  onAutoMatch,
  t,
}) {
  if (rows.length === 0) {
    return (
      <section className="panel" aria-labelledby="req-heading">
        <h2 id="req-heading" className="panel__title">{t('step3.title')}</h2>
        <p className="muted">{t('step3.noRequirements')}</p>
      </section>
    );
  }

  // Files that share content with a file already sitting in another document.
  // Offering them here is pointless: `canMatch` would refuse the assignment.
  const blockedByDuplicate = new Set();
  for (const group of duplicates) {
    if (group.length < 2) continue;
    const inUse = group.some((id) => Object.values(matches).includes(id));
    if (inUse) for (const id of group) blockedByDuplicate.add(id);
  }

  return (
    <section className="panel" aria-labelledby="req-heading">
      <div className="panel__head">
        <h2 id="req-heading" className="panel__title">{t('step3.title')}</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAutoMatch}>
          <Sparkles size={18} aria-hidden="true" />
          {t('step3.autoMatch')}
        </button>
      </div>
      <p className="panel__help">{t('step3.help')}</p>

      <ul className="reqlist">
        {rows.map((row) => {
          const requirement = row.requirement;
          const currentFileId = matches[requirement.id] || '';
          const options = files.map((file) => {
            const usedBy = Object.keys(matches).find(
              (id) => matches[id] === file.id && id !== requirement.id,
            );
            const duplicateBlocked = blockedByDuplicate.has(file.id) && !currentFileId;
            let label = `${file.name} — ${t('step2.pages', { count: file.pageCount })}`;
            if (usedBy) {
              label += ` (${t('step3.takenByOther', { title: requirementsById[usedBy]?.displayTitle || '' })})`;
            } else if (duplicateBlocked) {
              label += ` (${t('step3.duplicateBlocked')})`;
            }
            return { value: file.id, label, disabled: Boolean(usedBy) || duplicateBlocked };
          });

          const showExpiry = Boolean(row.file) && requirement.has_expiry;
          // A date input can only yield '' or a valid YYYY-MM-DD, but a restored
          // project file could carry anything, so validate before trusting it.
          const expiryDate = isValidISODate(row.expiryDate) ? row.expiryDate : '';

          return (
            <li
              key={requirement.id}
              className={`req${row.blocking ? ' req--blocking' : ''}`}
            >
              <div className="req__head">
                <span className="req__order" aria-hidden="true">{requirement.order}</span>
                <div className="req__titles">
                  <p className="req__title">{requirement.displayTitle}</p>
                  {lang === 'bn' ? (
                    <p className="req__title-alt">{requirement.title_en}</p>
                  ) : requirement.title_bn ? (
                    <p className="req__title-alt">{requirement.title_bn}</p>
                  ) : null}
                </div>
                <StatusBadge status={row.status} t={t} />
              </div>

              <div className="req__flags">
                <span className={`tag ${requirement.mandatory ? 'tag--required' : 'tag--optional'}`}>
                  {requirement.mandatory ? t('step3.mandatory') : t('step3.optional')}
                </span>
                <span className={`tag ${requirement.has_expiry ? 'tag--expiry' : ''}`}>
                  {requirement.has_expiry ? t('step3.hasExpiry') : t('step3.noExpiry')}
                </span>
                {row.file ? (
                  <span className="tag">
                    {t('step2.pages', { count: row.file.pageCount })}
                  </span>
                ) : null}
              </div>

              <div className="req__controls">
                <MatchSelect
                  label={{ id: requirement.id, text: t('step3.matchLabel', { title: requirement.displayTitle }) }}
                  value={currentFileId}
                  options={options}
                  onChange={(fileId) => onMatch(requirement.id, fileId)}
                  onUnmatch={() => onMatch(requirement.id, null)}
                  placeholder={t('step3.selectFile')}
                  noneLabel={t('step3.none')}
                  unmatchLabel={t('step3.unmatch')}
                  emptyLabel={t('step2.empty')}
                />

                {showExpiry ? (
                  <div className="expiry">
                    <label className="expiry__label" htmlFor={`expiry-${requirement.id}`}>
                      {t('step3.expiryLabel')}
                    </label>
                    <input
                      id={`expiry-${requirement.id}`}
                      className="input input--date"
                      type="date"
                      value={expiryDate}
                      onChange={(event) => onExpiryChange(requirement.id, event.target.value)}
                      aria-describedby={`expiry-hint-${requirement.id}`}
                    />
                    <p id={`expiry-hint-${requirement.id}`} className="expiry__hint">
                      {t('step3.expiryHint')}
                      {deadline ? ` · ${t('tender.deadline')}: ${formatISODateForDisplay(deadline, lang)}` : ''}
                      {expiryDate ? ` · ${formatISODateForDisplay(expiryDate, lang)}` : ''}
                    </p>
                  </div>
                ) : null}
              </div>

              {row.file && nameMatchScore(row.file.name, requirement) < 0.5 ? (
                <p
                  className="mt-2 flex items-start gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300"
                  role="status"
                >
                  <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>{t('step3.nameMismatchWarning', { title: requirement.displayTitle })}</span>
                </p>
              ) : null}

            </li>
          );
        })}
      </ul>
    </section>
  );
}