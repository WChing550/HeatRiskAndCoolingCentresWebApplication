import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import {
  X,
  CheckCircle2,
  XCircle,
  Languages,
  ArrowRight,
  Copy,
  EyeOff,
  Info
} from 'lucide-react';
import { ViewportModal } from '../../components/Shared.jsx';

const LANGUAGE_NAMES = {
  en: 'English',
  ms: 'Bahasa Melayu',
  'zh-CN': 'Mandarin',
};

export default function ReportReviewModal({
  selected,
  isAdmin,
  setSelected,
  refresh,
  setError,
  setSuccess,
  asset,
  dt,
  Field,
  Photo
}) {
  const [rv, setRv] = useState({
    status: 'approved',
    note: ''
  });

  const [reviewPhoto, setReviewPhoto] = useState(null);

  const [language, setLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [translation, setTranslation] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');

  const reportId = selected?.id;
  const requestRef = React.useRef(null);

  useEffect(() => {
    setLanguage('auto');
    setTargetLanguage('en');
    setTranslation(null);
    setTranslationError('');
    setTranslating(false);

    return () => requestRef.current?.abort();
  }, [reportId]);

  async function translateReport() {
    if (!reportId || translating) return;

    const controller = new AbortController();
    requestRef.current = controller;

    setTranslating(true);
    setTranslationError('');
    setTranslation(null);

    try {
      const result = await api(
        `/admin/reports/${reportId}/translate`,
        {
          method: 'POST',
          body: JSON.stringify({
            language,
            targetLanguage,
          }),
          signal: controller.signal,
        }
      );

      if (!controller.signal.aborted) {
        setTranslation(result);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setTranslationError(error.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setTranslating(false);
      }
    }
  }

  async function reviewReport(event) {
    event.preventDefault();

    if (!selected) return;

    const formData = new FormData();

    formData.append('status', rv.status);
    formData.append('note', rv.note);

    if (reviewPhoto) {
      formData.append('reviewImage', reviewPhoto);
    }

    try {
      await api(
        `/admin/reports/${selected.id}/review`,
        {
          method: 'POST',
          body: formData,
        }
      );

      setSuccess(`Report ${rv.status}.`);
      setSelected(null);
      setReviewPhoto(null);
      setRv({ status: 'approved', note: '' });

      await refresh();
    } catch (error) {
      setError(error.message);
    }
  }

  if (!selected) return null;

  return (
    <ViewportModal
      onClose={() => setSelected(null)}
      labelledBy="report-review-dialog-title"
    >
      <div className="modalhead">
        <div>
          <small>REPORT REVIEW · #{selected.id}</small>
          <h2 id="report-review-dialog-title">
            {selected.title}
          </h2>
        </div>

        <button
          className="iconbtn"
          aria-label="Close report review"
          onClick={() => setSelected(null)}
        >
          <X />
        </button>
      </div>

      <div className="metarow">
        <span>{selected.reporter_name || 'Your report'}</span>
        <span>⌖ {selected.location_text}</span>
        <span>{dt(selected.created_at)}</span>
      </div>

      <span className="tag">{selected.category}</span>

      {/* Report description and translation */}
      <section className="report-translation">

        <div className="report-translation-header">
          <b>Description</b>
        </div>

        <p className="report-original-text">
          {selected.description}
        </p>

        {isAdmin && (
          <div className="report-translation-controls">

            <div className="translation-heading">
              <Languages size={16} />
              <span>Translate description</span>
            </div>

            <div className="translation-language-row">

              <div className="translation-language-field">
                <label htmlFor="translation-source">
                  From
                </label>

                <select
                  id="translation-source"
                  value={language}
                  disabled={translating}
                  onChange={event => {
                    setLanguage(event.target.value);
                    setTranslation(null);
                    setTranslationError('');
                  }}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="ms">Bahasa Melayu</option>
                  <option value="zh-CN">Mandarin</option>
                </select>
              </div>

              <ArrowRight
                size={20}
                className="translation-direction-icon"
                aria-hidden="true"
              />

              <div className="translation-language-field">
                <label htmlFor="translation-target">
                  To
                </label>

                <select
                  id="translation-target"
                  value={targetLanguage}
                  disabled={translating}
                  onChange={event => {
                    setTargetLanguage(event.target.value);
                    setTranslation(null);
                    setTranslationError('');
                  }}
                >
                  <option value="en">English</option>
                  <option value="ms">Bahasa Melayu</option>
                  <option value="zh-CN">Mandarin</option>
                </select>
              </div>

            </div>

            <div className="translation-button-row">
              <button type="button" className="translation-action"
                disabled={translating}
                onClick={() => translation ? setTranslation(null) : translateReport()}>
                {translation ? <EyeOff size={15} /> : <Languages size={15} />}
                {translating ? 'Translating…' : translation ? 'Hide translation' : 'Translate'}
              </button>
            </div>

            <div aria-live="polite">
              {translationError && <p className="report-translation-error">{translationError}</p>}
              {translation && (
                <div className="report-translated-text">
                  <div className="translation-result-header">
                    <div className="translation-result-title">
                      <b>{translation.sameLanguage ? 'No translation needed' : 'Translated description'}</b>
                      <div className="translation-language-badge">
                        {LANGUAGE_NAMES[translation.detectedLanguage] || translation.detectedLanguage}
                        <ArrowRight size={13} aria-hidden="true" />
                        {LANGUAGE_NAMES[translation.targetLanguage] || LANGUAGE_NAMES[targetLanguage]}
                      </div>
                    </div>
                    {!translation.sameLanguage && (
                      <button type="button" className="translation-copy-btn"
                        title="Copy translation" aria-label="Copy translation"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(translation.translatedText);
                            setSuccess('Translation copied.');
                          } catch {
                            setTranslationError('Unable to copy translation.');
                          }
                        }}>
                        <Copy size={17} />
                      </button>
                    )}
                  </div>
                  <div className="translation-result-body">
                    <p>{translation.sameLanguage ? 'The description is already in the selected language.' : translation.translatedText}</p>
                  </div>
                  {!translation.sameLanguage && (
                    <div className="translation-disclaimer">
                      <Info size={13} aria-hidden="true" />
                      <span>Machine translated by MyMemory. Verify important details.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </section>

      {/* Submitted evidence */}
      {selected.image_url && (
        <div className="evidence">
          <b>Submitted evidence</b>
          <img
            src={asset(selected.image_url)}
            alt="Submitted evidence"
          />
        </div>
      )}

      {/* Existing review note */}
      {selected.review_note && (
        <div className="reviewnote">
          <b>Review note</b>
          <p>{selected.review_note}</p>
        </div>
      )}

      {/* Administrator evidence */}
      {selected.review_image_url && (
        <div className="evidence">
          <b>Administrator review photo</b>
          <img
            src={asset(selected.review_image_url)}
            alt="Administrator review evidence"
          />
        </div>
      )}

      {/* Admin review form */}
      {isAdmin && (
        <form
          className="stack"
          onSubmit={reviewReport}
        >
          <Field label="Decision">
            <select
              value={rv.status}
              onChange={event =>
                setRv(previous => ({
                  ...previous,
                  status: event.target.value
                }))
              }
            >
              <option value="approved">
                Approve report
              </option>
              <option value="rejected">
                Reject report
              </option>
            </select>
          </Field>

          <Field
            label={
              rv.status === 'rejected'
                ? 'Rejection reason (required)'
                : 'Review note (optional)'
            }
          >
            <textarea
              rows="3"
              required={rv.status === 'rejected'}
              value={rv.note}
              onChange={event =>
                setRv(previous => ({
                  ...previous,
                  note: event.target.value
                }))
              }
            />
          </Field>

          <Photo
            label="Review evidence photo (optional)"
            file={reviewPhoto}
            onChange={setReviewPhoto}
          />

          <div className="actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>

            <button className="btn primary">
              {rv.status === 'approved' ? (
                <>
                  <CheckCircle2 size={16} /> Approve
                </>
              ) : (
                <>
                  <XCircle size={16} /> Reject
                </>
              )}
            </button>
          </div>
        </form>
      )}

    </ViewportModal>
  );
}
