import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { IssueList } from "../../components/IssueList";
import { MerchantListingFields } from "../../components/MerchantListingFields";
import { Panel } from "../../components/Panel";
import { createBlankGear, createSampleGear } from "../../data/sampleGear";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { type ValidationIssue } from "../../types/common";
import { gearSlotTypes, supportedWeaponTypes, type GearDocument } from "../../types/gear";
import { validateGearDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { normalizeGearDocument } from "../../utils/gearDocuments";
import {
  suggestGearInventoryFootprint,
  type GearBalanceStatus,
  toGearBalanceIssues,
  validateGearBalance
} from "../../utils/gearBalanceValidation";
import { buildGearBundleForTarget } from "../../utils/exporters";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchGear(document: GearDocument): GearDocument {
  return {
    ...normalizeGearDocument(document),
    updatedAt: isoNow(),
  };
}

function isGearDocument(value: unknown): value is GearDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "slot" in value &&
      "stats" in value &&
      "inventory" in value
  );
}

function parseNumberList(input: string) {
  return input
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
}

function serializeNumberList(values?: number[]) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function countEnabledSources(document: GearDocument) {
  let count = 0;
  if (document.inventory.startingOwned) {
    count += 1;
  }
  if (document.acquisition.shop.enabled) {
    count += 1;
  }
  if (document.merchant.soldAtMerchant) {
    count += 1;
  }
  if (document.acquisition.enemyDrop.enabled) {
    count += 1;
  }
  if (document.acquisition.victoryReward.enabled) {
    count += 1;
  }
  return count;
}

function getBalanceStatusLabel(status: GearBalanceStatus) {
  switch (status) {
    case "pass":
      return "Balanced";
    case "caution":
      return "Caution";
    case "fail":
      return "Out of Band";
    default:
      return "Balance";
  }
}

function getBalanceStatusClass(status: GearBalanceStatus) {
  switch (status) {
    case "pass":
      return "accent";
    case "caution":
      return "warning";
    case "fail":
      return "danger";
    default:
      return "";
  }
}

export function GearEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: GearDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isGearDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica gear format.");
        return;
      }
      setDocument(touchGear(normalizeGearDocument(parsed)));
    } catch {
      notify("Could not load the selected gear from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.gear.document"
      exportTargetKey="technica.gear.exportTarget"
      draftType="gear"
      initialDocument={createSampleGear()}
      createBlank={createBlankGear}
      createSample={createSampleGear}
      validate={validateGearDocument}
      buildBundleForTarget={(document, target) => buildGearBundleForTarget(normalizeGearDocument(document), target)}
      getTitle={(document) => normalizeGearDocument(document).name}
      isImportPayload={isGearDocument}
      touchDocument={touchGear}
      replacePrompt="Replace the current gear draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica gear draft or export."
      renderWorkspace={({
        document,
        setDocument,
        patchDocument,
        loadSample,
        clearDocument,
        importDraft,
        saveDraft,
        exportBundle,
        isMobile,
        canSendToDesktop,
        isSendingToDesktop,
        sendToDesktop,
      }) => {
        const gear = normalizeGearDocument(document);
        const balanceReport = validateGearBalance(gear);
        const footprintSuggestion = suggestGearInventoryFootprint(gear);
        const balanceIssues: ValidationIssue[] = toGearBalanceIssues(balanceReport);
        const balanceStatusClass = getBalanceStatusClass(balanceReport.status);
        const currentMatchesSuggestion =
          gear.inventory.massKg === footprintSuggestion.inventory.massKg &&
          gear.inventory.bulkBu === footprintSuggestion.inventory.bulkBu &&
          gear.inventory.powerW === footprintSuggestion.inventory.powerW;
        const patchGearDocument = (updater: (current: GearDocument) => GearDocument) =>
          patchDocument((current) => updater(normalizeGearDocument(current)));

        return (
          <>
            <Panel
              title="Gear Setup"
              subtitle="Define equipment, its gameplay payload, and how players can obtain it in Chaos Core."
              actions={
                <div className="toolbar">
                  <button type="button" className="ghost-button" onClick={loadSample}>
                    Load sample
                  </button>
                  <button type="button" className="ghost-button" onClick={clearDocument}>
                    Clear
                  </button>
                </div>
              }
            >
              <div className="form-grid">
                <label className="field">
                  <span>Gear id</span>
                  <input
                    value={gear.id}
                    onChange={(event) => patchGearDocument((current) => ({ ...current, id: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={gear.name}
                    onChange={(event) => patchGearDocument((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={gear.description}
                    onChange={(event) => patchGearDocument((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
                <div className="field full">
                  <ImageAssetField
                    label="Gear icon"
                    emptyLabel="No gear icon attached."
                    hint="Exports as a stable asset file for Chaos Core imports."
                    asset={gear.iconAsset}
                    onChange={(iconAsset) => patchGearDocument((current) => ({ ...current, iconAsset }))}
                  />
                </div>
                <label className="field">
                  <span>Slot</span>
                  <select
                    value={gear.slot}
                    onChange={(event) =>
                      patchGearDocument((current) => ({
                        ...current,
                        slot: event.target.value as GearDocument["slot"],
                      }))
                    }
                  >
                    {gearSlotTypes.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Weapon type</span>
                  <select
                    value={gear.weaponType ?? ""}
                    onChange={(event) =>
                      patchGearDocument((current) => ({
                        ...current,
                        weaponType: event.target.value ? (event.target.value as GearDocument["weaponType"]) : undefined,
                      }))
                    }
                  >
                    <option value="">None</option>
                    {supportedWeaponTypes.map((weaponType) => (
                      <option key={weaponType} value={weaponType}>
                        {weaponType}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field field-inline">
                  <span>Mechanical</span>
                  <input
                    type="checkbox"
                    checked={gear.isMechanical}
                    onChange={(event) =>
                      patchGearDocument((current) => ({ ...current, isMechanical: event.target.checked }))
                    }
                  />
                </label>
              </div>

              <div className="subsection">
                <h4>Stat Profile</h4>
                <div className="form-grid">
                  <label className="field">
                    <span>ATK</span>
                    <input
                      type="number"
                      value={gear.stats.atk}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          stats: {
                            ...current.stats,
                            atk: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>DEF</span>
                    <input
                      type="number"
                      value={gear.stats.def}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          stats: {
                            ...current.stats,
                            def: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>AGI</span>
                    <input
                      type="number"
                      value={gear.stats.agi}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          stats: {
                            ...current.stats,
                            agi: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>ACC</span>
                    <input
                      type="number"
                      value={gear.stats.acc}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          stats: {
                            ...current.stats,
                            acc: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>HP</span>
                    <input
                      type="number"
                      value={gear.stats.hp}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          stats: {
                            ...current.stats,
                            hp: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Wear</span>
                    <input
                      type="number"
                      value={gear.wear}
                      onChange={(event) =>
                        patchGearDocument((current) => ({ ...current, wear: Number(event.target.value || 0) }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Module slots</span>
                    <input
                      type="number"
                      value={gear.moduleSlots}
                      onChange={(event) =>
                        patchGearDocument((current) => ({ ...current, moduleSlots: Number(event.target.value || 0) }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Granted cards</span>
                    <input
                      value={serializeCommaList(gear.cardsGranted)}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          cardsGranted: parseCommaList(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Attached modules</span>
                    <input
                      value={serializeCommaList(gear.attachedModules)}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          attachedModules: parseCommaList(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="subsection">
                <h4>Balance Check</h4>
                <div className="toolbar split">
                  <div>
                    <div className="chip-row">
                      <span className={`pill ${balanceStatusClass}`.trim()}>{getBalanceStatusLabel(balanceReport.status)}</span>
                      <span className="pill">Score {balanceReport.metrics.score}</span>
                      <span className="pill">Grade {balanceReport.metrics.scoreGrade}</span>
                      <span className="pill">
                        Target {balanceReport.metrics.targetScoreMin}-{balanceReport.metrics.targetScoreMax}
                      </span>
                      <span className="pill">Card package {balanceReport.metrics.effectiveCardCount}</span>
                      <span className="pill">
                        Expected {balanceReport.metrics.targetCardCountMin}-{balanceReport.metrics.targetCardCountMax}
                      </span>
                    </div>
                    <p className="muted">{balanceReport.summary}</p>
                  </div>
                </div>
                <IssueList
                  issues={balanceIssues}
                  emptyLabel="This gear sits inside the current Chaos Core starter balance band."
                />
              </div>

              <div className="subsection">
                <h4>Inventory Footprint</h4>
                <div className="toolbar split">
                  <div>
                    <div className="chip-row">
                      <span className="pill accent">
                        Suggested {footprintSuggestion.inventory.massKg} kg / {footprintSuggestion.inventory.bulkBu} bu / {footprintSuggestion.inventory.powerW} w
                      </span>
                      <span className={`pill ${currentMatchesSuggestion ? "accent" : ""}`.trim()}>
                        Current {gear.inventory.massKg} kg / {gear.inventory.bulkBu} bu / {gear.inventory.powerW} w
                      </span>
                    </div>
                    <p className="muted">{footprintSuggestion.summary}</p>
                  </div>
                  <div className="toolbar">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        patchGearDocument((current) => ({
                          ...current,
                          inventory: {
                            ...current.inventory,
                            ...footprintSuggestion.inventory,
                          },
                        }))
                      }
                    >
                      Use suggested footprint
                    </button>
                  </div>
                </div>
                <div className="issue-list">
                  {footprintSuggestion.reasons.map((reason) => (
                    <div key={reason} className="issue-item">
                      <span className="issue-message">{reason}</span>
                    </div>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Mass (kg)</span>
                    <input
                      type="number"
                      value={gear.inventory.massKg}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          inventory: {
                            ...current.inventory,
                            massKg: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Bulk (bu)</span>
                    <input
                      type="number"
                      value={gear.inventory.bulkBu}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          inventory: {
                            ...current.inventory,
                            bulkBu: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Power (w)</span>
                    <input
                      type="number"
                      value={gear.inventory.powerW}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          inventory: {
                            ...current.inventory,
                            powerW: Number(event.target.value || 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Metadata</span>
                    <textarea
                      rows={5}
                      value={serializeKeyValueLines(gear.metadata)}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          metadata: parseKeyValueLines(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="subsection">
                <h4>Acquisition & Rewards</h4>
                <p className="muted">
                  Track whether the player starts with this gear, where shops can sell it, what enemies can drop it,
                  and which floor or region victories can grant it.
                </p>

                <div className="form-grid">
                  <label className="field field-inline">
                    <span>Player starts with it</span>
                    <input
                      type="checkbox"
                      checked={gear.inventory.startingOwned}
                      onChange={(event) =>
                        patchGearDocument((current) => ({
                          ...current,
                          inventory: {
                            ...current.inventory,
                            startingOwned: event.target.checked,
                          },
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="nested-card">
                  <div className="form-grid">
                    <label className="field field-inline">
                      <span>Sold in a shop</span>
                      <input
                        type="checkbox"
                        checked={gear.acquisition.shop.enabled}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              shop: {
                                ...current.acquisition.shop,
                                enabled: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Shop unlock floor</span>
                      <input
                        type="number"
                        min={0}
                        disabled={!gear.acquisition.shop.enabled}
                        value={gear.acquisition.shop.unlockFloor}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              shop: {
                                ...current.acquisition.shop,
                                unlockFloor: Number(event.target.value || 0),
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Shop notes</span>
                      <textarea
                        rows={2}
                        disabled={!gear.acquisition.shop.enabled}
                        value={gear.acquisition.shop.notes}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              shop: {
                                ...current.acquisition.shop,
                                notes: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <MerchantListingFields
                  value={gear.merchant}
                  onChange={(merchant) => patchGearDocument((current) => ({ ...current, merchant }))}
                />

                <div className="nested-card">
                  <div className="form-grid">
                    <label className="field field-inline">
                      <span>Dropped by enemies</span>
                      <input
                        type="checkbox"
                        checked={gear.acquisition.enemyDrop.enabled}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              enemyDrop: {
                                ...current.acquisition.enemyDrop,
                                enabled: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Enemy unit ids</span>
                      <input
                        disabled={!gear.acquisition.enemyDrop.enabled}
                        value={serializeCommaList(gear.acquisition.enemyDrop.enemyUnitIds)}
                        placeholder="enemy_raider, enemy_phase_sapper"
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              enemyDrop: {
                                ...current.acquisition.enemyDrop,
                                enemyUnitIds: parseCommaList(event.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Enemy drop notes</span>
                      <textarea
                        rows={2}
                        disabled={!gear.acquisition.enemyDrop.enabled}
                        value={gear.acquisition.enemyDrop.notes}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              enemyDrop: {
                                ...current.acquisition.enemyDrop,
                                notes: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="nested-card">
                  <div className="form-grid">
                    <label className="field field-inline">
                      <span>Victory reward</span>
                      <input
                        type="checkbox"
                        checked={gear.acquisition.victoryReward.enabled}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              victoryReward: {
                                ...current.acquisition.victoryReward,
                                enabled: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Reward floor ordinals</span>
                      <input
                        disabled={!gear.acquisition.victoryReward.enabled}
                        value={serializeNumberList(gear.acquisition.victoryReward.floorOrdinals)}
                        placeholder="1, 2, 5"
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              victoryReward: {
                                ...current.acquisition.victoryReward,
                                floorOrdinals: parseNumberList(event.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Reward region ids</span>
                      <input
                        disabled={!gear.acquisition.victoryReward.enabled}
                        value={serializeCommaList(gear.acquisition.victoryReward.regionIds)}
                        placeholder="outer_deck, blackwater_docks"
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              victoryReward: {
                                ...current.acquisition.victoryReward,
                                regionIds: parseCommaList(event.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Victory reward notes</span>
                      <textarea
                        rows={2}
                        disabled={!gear.acquisition.victoryReward.enabled}
                        value={gear.acquisition.victoryReward.notes}
                        onChange={(event) =>
                          patchGearDocument((current) => ({
                            ...current,
                            acquisition: {
                              ...current.acquisition,
                              victoryReward: {
                                ...current.acquisition.victoryReward,
                                notes: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <label className="field full">
                  <span>Other source notes</span>
                  <textarea
                    rows={3}
                    value={gear.acquisition.otherSourcesNotes}
                    onChange={(event) =>
                      patchGearDocument((current) => ({
                        ...current,
                        acquisition: {
                          ...current.acquisition,
                          otherSourcesNotes: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{gear.slot}</span>
                  <span className="pill">{gear.cardsGranted.length} granted cards</span>
                  <span className="pill">{countEnabledSources(gear)} source(s)</span>
                  <span className="pill accent">Chaos Core export</span>
                </div>
                <div className="toolbar">
                  {isMobile ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void sendToDesktop()}
                      disabled={!canSendToDesktop || isSendingToDesktop}
                    >
                      {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="ghost-button" onClick={importDraft}>
                        Import draft
                      </button>
                      <button type="button" className="ghost-button" onClick={saveDraft}>
                        Save draft file
                      </button>
                      <button type="button" className="primary-button" onClick={() => void exportBundle()}>
                        Export bundle
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Panel>

            <ChaosCoreDatabasePanel
              contentType="gear"
              currentDocument={gear}
              buildBundle={(current) => buildGearBundleForTarget(normalizeGearDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish gear runtime JSON and icons straight into the Chaos Core repo, then reload live game entries for balancing."
            />
          </>
        );
      }}
    />
  );
}
