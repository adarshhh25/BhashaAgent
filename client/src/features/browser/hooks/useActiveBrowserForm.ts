import { useState, useEffect, useCallback, useRef } from 'react';
import { formService } from '../../forms/services/form.service';
import type { FormTask } from '../../forms/types/form.types';
import type { BrowserDetectedField } from '../types/browser.types';
import { tabContextManager } from '../services/tab-context-manager';

export interface UseActiveBrowserFormResult {
  activeFormTask: FormTask | null;
  activeFormTaskId: string | undefined;
  activeTabId: number | null;
  detectedFields: BrowserDetectedField[];
  fieldCount: number;
  webpageTitle: string | null;
  webpageUrl: string | null;
  isScanning: boolean;
  rescan: () => Promise<void>;
}

export function useActiveBrowserForm(
  conversationId: string | null | undefined,
): UseActiveBrowserFormResult {
  const [activeFormTask, setActiveFormTask] = useState<FormTask | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [detectedFields, setDetectedFields] = useState<BrowserDetectedField[]>([]);
  const [webpageTitle, setWebpageTitle] = useState<string | null>(null);
  const [webpageUrl, setWebpageUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const syncLockRef = useRef(false);

  const scanAndSyncForm = useCallback(async () => {
    if (!conversationId || syncLockRef.current) return;
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      return;
    }

    syncLockRef.current = true;
    setIsScanning(true);

    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        const [lastTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = lastTab;
      }
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        setDetectedFields([]);
        setActiveFormTask(null);
        setActiveTabId(null);
        setWebpageUrl(null);
        setWebpageTitle(null);
        setIsScanning(false);
        syncLockRef.current = false;
        return;
      }

      setActiveTabId(tab.id);
      setWebpageUrl(tab.url);
      setWebpageTitle(tab.title || null);

      // Attempt content script detection first
      let scannedFields: BrowserDetectedField[] = [];
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DISCOVER_FORM_CONTEXT',
        });
        if (response?.success && Array.isArray(response.data?.fields)) {
          scannedFields = response.data.fields as BrowserDetectedField[];
        }
      } catch {
        // Content script might not be injected yet
      }

      // If content script returned empty or unavailable, scan DOM directly via scripting API
      if (scannedFields.length === 0 && chrome.scripting?.executeScript) {
        try {
          const execResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const elements = Array.from(
                document.querySelectorAll('input, select, textarea')
              ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

              const fields: Array<{
                fieldIdentifier: string;
                name: string;
                label: string;
                inputType: string;
                isRequired: boolean;
                detectedOrder: number;
                options?: string[];
              }> = [];
              const processedRadios = new Set<string>();
              const seenIdentifiers = new Set<string>();

              for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (!el) continue;
                const tag = el.tagName.toLowerCase();
                const type = ('type' in el && typeof el.type === 'string') ? el.type.toLowerCase() : tag;
                if (type === 'submit' || type === 'reset' || type === 'hidden' || type === 'button') continue;

                const id = el.id || '';
                const name = el.name || '';
                if (type === 'radio' && name) {
                  if (processedRadios.has(name)) continue;
                  processedRadios.add(name);
                }

                let label = '';
                if (id) {
                  try {
                    const lEl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                    if (lEl) label = lEl.textContent?.trim() || '';
                  } catch {
                    // Ignore querySelector syntax exceptions for unusual IDs
                  }
                }
                if (!label) {
                  const pLabel = el.closest('label');
                  if (pLabel) {
                    const clone = pLabel.cloneNode(true) as HTMLElement;
                    clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
                    label = clone.textContent?.trim() || '';
                  }
                }
                if (!label && el.getAttribute('aria-label')) {
                  label = el.getAttribute('aria-label')!.trim();
                }
                if (!label) {
                  const fieldset = el.closest('fieldset');
                  const legend = fieldset?.querySelector('legend');
                  if (legend) label = legend.textContent?.trim() || '';
                }
                if (!label && 'placeholder' in el && el.placeholder) {
                  label = el.placeholder.trim();
                }
                if (!label) {
                  const prev = el.previousElementSibling;
                  if (prev && (prev.tagName.toLowerCase() === 'label' || prev.classList.contains('label') || prev.classList.contains('form-label'))) {
                    label = prev.textContent?.trim() || '';
                  }
                }
                if (!label && (name || id)) {
                  label = (name || id)
                    .replace(/[-_]+/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                    .trim();
                }

                let options: string[] | undefined;
                if (type === 'radio' && name) {
                  try {
                    const group = Array.from(
                      document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
                    ) as HTMLInputElement[];
                    options = group.map((r) => {
                      const rId = r.id;
                      let rLabel = r.value || '';
                      if (rId) {
                        try {
                          const rLEl = document.querySelector(`label[for="${CSS.escape(rId)}"]`);
                          if (rLEl?.textContent?.trim()) rLabel = rLEl.textContent.trim();
                        } catch {
                          // Ignore query exceptions
                        }
                      }
                      if (!rLabel && r.closest('label')?.textContent?.trim()) {
                        rLabel = r.closest('label')!.textContent!.trim();
                      }
                      return rLabel;
                    }).filter(Boolean);
                  } catch {
                    // Ignore radio query exceptions
                  }
                } else if (tag === 'select') {
                  const s = el as HTMLSelectElement;
                  options = Array.from(s.options).map((o) => o.text?.trim() || o.value).filter(Boolean);
                }

                let baseId = id || '';
                if (!baseId && type === 'checkbox') {
                  const val = (el as HTMLInputElement).value;
                  baseId = name && val ? `${name}_${val}` : (name || `field_${i}`);
                } else if (!baseId) {
                  baseId = name || `field_${i}`;
                }

                let uniqueId = baseId;
                let counter = 1;
                while (seenIdentifiers.has(uniqueId)) {
                  uniqueId = `${baseId}_${counter++}`;
                }
                seenIdentifiers.add(uniqueId);

                fields.push({
                  fieldIdentifier: uniqueId,
                  name: name || id || uniqueId,
                  label: label || `Field ${i + 1}`,
                  inputType: type === 'radio' ? 'RADIO' : type === 'checkbox' ? 'CHECKBOX' : type === 'select' ? 'SELECT' : (type || 'TEXT').toUpperCase(),
                  isRequired: Boolean(el.required),
                  detectedOrder: i + 1,
                  options,
                });
              }
              return { fields };
            },
          });
          if (execResults?.[0]?.result?.fields) {
            scannedFields = execResults[0].result.fields as BrowserDetectedField[];
          }
        } catch (injectErr) {
          console.warn('[useActiveBrowserForm] Direct DOM script scan failed:', injectErr);
        }
      }

      setDetectedFields(scannedFields);

      if (scannedFields.length === 0) {
        setIsScanning(false);
        syncLockRef.current = false;
        return;
      }

      // Check if a FormTask already exists for this conversation and URL
      const taskList = await formService.listTasks({
        conversationId,
        limit: 10,
      });

      // Strict URL isolation: match the task created for this specific page URL
      const existingTask = taskList.tasks.find(
        (t) => t.status !== 'CANCELLED' && t.status !== 'COMPLETED' && t.webpageUrl === tab.url,
      );

      const fieldInputs = scannedFields.map((f, index) => ({
        fieldIdentifier: f.fieldIdentifier || f.name || `field_${index + 1}`,
        name: f.name || f.fieldIdentifier || `field_${index + 1}`,
        label: f.label || f.name || `Field ${index + 1}`,
        elementType: f.elementType || 'input',
        inputType: f.inputType || f.elementType || 'TEXT',
        isRequired: Boolean(f.isRequired),
        isDisabled: Boolean(f.isDisabled),
        isReadOnly: Boolean(f.isReadOnly),
        detectedOrder: index + 1,
        detectionConfidence: 1,
        options: f.options ?? null,
      }));

      let targetTaskId: string;

      if (existingTask) {
        targetTaskId = existingTask.id;
        if (fieldInputs.length > 0) {
          try {
            await formService.addFields(existingTask.id, fieldInputs);
          } catch (addErr) {
            console.warn('[useActiveBrowserForm] addFields notice:', addErr);
          }
        }
        const updated = await formService.getTask(existingTask.id);
        setActiveFormTask(updated.task);
      } else {
        const created = await formService.createTask({
          conversationId,
          webpageUrl: tab.url,
          title: tab.title || 'Active Form Task',
        });
        targetTaskId = created.id;

        if (fieldInputs.length > 0) {
          try {
            await formService.addFields(created.id, fieldInputs);
          } catch (addErr) {
            console.warn('[useActiveBrowserForm] addFields notice:', addErr);
          }
        }
        const refreshed = await formService.getTask(created.id);
        setActiveFormTask(refreshed.task);
      }

      // Register tab-level association in TabContextManager
      tabContextManager.setTabState(tab.id, {
        url: tab.url,
        title: tab.title || '',
        formTaskId: targetTaskId,
        detectedFields: scannedFields,
      });
      tabContextManager.associateFormTask(conversationId, tab.url, targetTaskId);
    } catch (err) {
      console.warn('[useActiveBrowserForm] Scan or sync encountered an issue:', err);
    } finally {
      setIsScanning(false);
      syncLockRef.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void scanAndSyncForm();
    }, 0);

    if (typeof chrome === 'undefined') {
      return () => clearTimeout(timer);
    }

    const handleTabActivated = () => {
      void scanAndSyncForm();
    };

    const handleTabUpdated = (_tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status === 'complete') {
        void scanAndSyncForm();
      }
    };

    const handleRuntimeMessage = (message: { type?: string }) => {
      if (message?.type === 'PAGE_DOM_MUTATED' || message?.type === 'TAB_PAGE_LOADED') {
        void scanAndSyncForm();
      }
    };

    chrome.tabs?.onActivated?.addListener(handleTabActivated);
    chrome.tabs?.onUpdated?.addListener(handleTabUpdated);
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);

    return () => {
      clearTimeout(timer);
      chrome.tabs?.onActivated?.removeListener(handleTabActivated);
      chrome.tabs?.onUpdated?.removeListener(handleTabUpdated);
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, [scanAndSyncForm]);

  return {
    activeFormTask,
    activeFormTaskId: activeFormTask?.id,
    activeTabId,
    detectedFields,
    fieldCount: detectedFields.length,
    webpageTitle,
    webpageUrl,
    isScanning,
    rescan: scanAndSyncForm,
  };
}
