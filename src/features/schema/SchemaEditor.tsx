import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankSchema, createSampleSchema } from "../../data/sampleSchema";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import {
  schemaCoreCategories,
  schemaKnownRoomTags,
  schemaNetworkOutputModes,
  type SchemaDocument,
  type SchemaNetworkOutputMode,
  type SchemaTagOutputModifier
} from "../../types/schema";
import {
  createSchemaOperationalRequirements,
  createSchemaResourceWallet,
  createSchemaTagOutputModifier,
  normalizeSchemaDocument
} from "../../utils/schemaComposer";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildSchemaBundleForTarget } from "../../utils/exporters";
import { validateSchemaDocument } from "../../utils/contentValidation";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchSchema(document: SchemaDocument): SchemaDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function normalize(document: unknown) {
  return normalizeSchemaDocument(document, createBlankSchema());
}

function isSchemaDocument(value: unknown): value is SchemaDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "kind" in value && "buildCost" in value);
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: SchemaDocument) => void) {
  try {
    const parsed = normalize(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isSchemaDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica schema format.");
      return;
    }
    setDocument(touchSchema(parsed));
  } catch {
    notify("Could not load the selected schema from the Chaos Core database.");
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseStringList(value: string) {
  return uniqueStrings(value.split(/[\n,]/));
}

function serializeStringList(values: string[]) {
  return values.join("\n");
}

function formatTagLabel(tag: string) {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatOutputModeLabel(mode: SchemaNetworkOutputMode) {
  return mode === "add_input" ? "+ input" : "fixed";
}

function isKnownRoomTag(tag: string) {
  return schemaKnownRoomTags.includes(tag as (typeof schemaKnownRoomTags)[number]);
}

function coerceSchemaKind(document: SchemaDocument, nextKind: SchemaDocument["kind"]): SchemaDocument {
  if (nextKind === "fortification") {
    return {
      ...document,
      kind: "fortification",
      shortCode: "",
      category: "",
      operationalRequirements: createSchemaOperationalRequirements(),
      powerOutputWatts: 0,
      powerOutputMode: "fixed",
      commsOutputBw: 0,
      commsOutputMode: "fixed",
      supplyOutputCrates: 0,
      supplyOutputMode: "fixed",
      upkeep: createSchemaResourceWallet(),
      wadUpkeepPerTick: 0,
      incomePerTick: createSchemaResourceWallet(),
      supportRadius: 0,
      tagOutputModifiers: []
    };
  }

  return {
    ...document,
    kind: "core",
    category: document.category.trim() ? document.category : "logistics"
  };
}

function toPartialResourceWallet(wallet: SchemaDocument["buildCost"]) {
  return Object.fromEntries(
    Object.entries(wallet).filter(([, amount]) => Number.isFinite(amount) && amount > 0)
  );
}

function buildRuntimePreview(document: SchemaDocument) {
  const base = {
    id: document.id.trim(),
    displayName: document.name.trim(),
    description: document.description.trim(),
    buildCost: toPartialResourceWallet(document.buildCost),
    unlockSource: document.unlockSource,
    unlockCost: document.unlockSource === "schema" ? toPartialResourceWallet(document.unlockCost) : undefined,
    unlockWadCost: document.unlockSource === "schema" ? document.unlockWadCost : undefined,
    requiredQuestIds: document.requiredQuestIds,
    preferredRoomTags: document.preferredRoomTags,
    placeholder: document.placeholder || undefined,
    kind: document.kind
  };

  if (document.kind === "fortification") {
    return base;
  }

  return {
    ...base,
    shortCode: document.shortCode.trim() || undefined,
    category: document.category.trim() || undefined,
    operationalRequirements: {
      powerWatts: document.operationalRequirements.powerWatts,
      commsBw: document.operationalRequirements.commsBw,
      supplyCrates: document.operationalRequirements.supplyCrates
    },
    powerOutputWatts: document.powerOutputWatts || undefined,
    powerOutputMode: document.powerOutputMode !== "fixed" ? document.powerOutputMode : undefined,
    commsOutputBw: document.commsOutputBw || undefined,
    commsOutputMode: document.commsOutputMode !== "fixed" ? document.commsOutputMode : undefined,
    supplyOutputCrates: document.supplyOutputCrates || undefined,
    supplyOutputMode: document.supplyOutputMode !== "fixed" ? document.supplyOutputMode : undefined,
    upkeep: toPartialResourceWallet(document.upkeep),
    wadUpkeepPerTick: document.wadUpkeepPerTick,
    incomePerTick: toPartialResourceWallet(document.incomePerTick),
    supportRadius: document.supportRadius,
    tagOutputModifiers: document.tagOutputModifiers.map((modifier) => ({
      tag: modifier.tag,
      output: toPartialResourceWallet(modifier.output),
      note: modifier.note.trim() || undefined
    }))
  };
}

function WalletFields({
  labelPrefix,
  wallet,
  onChange
}: {
  labelPrefix: string;
  wallet: SchemaDocument["buildCost"];
  onChange: (nextWallet: SchemaDocument["buildCost"]) => void;
}) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>{labelPrefix} Metal scrap</span>
        <input
          type="number"
          min={0}
          value={wallet.metalScrap}
          onChange={(event) => onChange({ ...wallet, metalScrap: Number(event.target.value || 0) })}
        />
      </label>
      <label className="field">
        <span>{labelPrefix} Wood</span>
        <input
          type="number"
          min={0}
          value={wallet.wood}
          onChange={(event) => onChange({ ...wallet, wood: Number(event.target.value || 0) })}
        />
      </label>
      <label className="field">
        <span>{labelPrefix} Chaos shards</span>
        <input
          type="number"
          min={0}
          value={wallet.chaosShards}
          onChange={(event) => onChange({ ...wallet, chaosShards: Number(event.target.value || 0) })}
        />
      </label>
      <label className="field">
        <span>{labelPrefix} Steam components</span>
        <input
          type="number"
          min={0}
          value={wallet.steamComponents}
          onChange={(event) => onChange({ ...wallet, steamComponents: Number(event.target.value || 0) })}
        />
      </label>
    </div>
  );
}

export function SchemaEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.schema.document"
      exportTargetKey="technica.schema.exportTarget"
      draftType="schema"
      initialDocument={createSampleSchema()}
      createBlank={createBlankSchema}
      createSample={createSampleSchema}
      validate={(document) => validateSchemaDocument(normalize(document))}
      buildBundleForTarget={(document, target) => buildSchemaBundleForTarget(normalize(document), target)}
      getTitle={(document) => normalize(document).name}
      isImportPayload={isSchemaDocument}
      touchDocument={(document) => touchSchema(normalize(document))}
      replacePrompt="Replace the current schema draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica schema draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument }) => {
        const schema = normalize(document);
        const isFortification = schema.kind === "fortification";
        const runtimePreview = buildRuntimePreview(schema);
        const customRoomTags = schema.preferredRoomTags.filter((tag) => !isKnownRoomTag(tag));

        const patchSchema = (updater: (current: SchemaDocument) => SchemaDocument) =>
          patchDocument((current) => touchSchema(normalize(updater(normalize(current)))));

        const setPreferredRoomTags = (nextTags: string[]) =>
          patchSchema((current) => ({
            ...current,
            preferredRoomTags: uniqueStrings(nextTags)
          }));

        const updateModifier = (
          modifierId: string,
          updater: (modifier: SchemaTagOutputModifier) => SchemaTagOutputModifier
        ) =>
          patchSchema((current) => ({
            ...current,
            tagOutputModifiers: current.tagOutputModifiers.map((modifier) =>
              modifier.id === modifierId ? updater(modifier) : modifier
            )
          }));

        return (
          <div className="stack-list">
            <div className="tool-suite-grid tool-suite-grid-dual">
              <div className="tool-suite-column">
                <Panel
                  title="Schema Setup"
                  subtitle="Edit Chaos Core native S.C.H.E.M.A. definitions field-for-field for C.O.R.E. builds and fortifications."
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
                      <span>Schema id</span>
                      <input
                        value={schema.id}
                        onChange={(event) => patchSchema((current) => ({ ...current, id: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Display name</span>
                      <input
                        value={schema.name}
                        onChange={(event) => patchSchema((current) => ({ ...current, name: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Authorization type</span>
                      <select
                        value={schema.kind}
                        onChange={(event) =>
                          patchSchema((current) =>
                            coerceSchemaKind(current, event.target.value as SchemaDocument["kind"])
                          )
                        }
                      >
                        <option value="core">C.O.R.E.</option>
                        <option value="fortification">Fortification</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Unlock source</span>
                      <select
                        value={schema.unlockSource}
                        onChange={(event) =>
                          patchSchema((current) => ({
                            ...current,
                            unlockSource: event.target.value as SchemaDocument["unlockSource"]
                          }))
                        }
                      >
                        <option value="starter">starter</option>
                        <option value="schema">schema</option>
                      </select>
                    </label>
                    {!isFortification ? (
                      <>
                        <label className="field">
                          <span>Short code</span>
                          <input
                            value={schema.shortCode}
                            onChange={(event) =>
                              patchSchema((current) => ({ ...current, shortCode: event.target.value }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Category</span>
                          <select
                            value={schema.category}
                            onChange={(event) =>
                              patchSchema((current) => ({ ...current, category: event.target.value }))
                            }
                          >
                            {schemaCoreCategories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label className="field full">
                      <span>Description</span>
                      <textarea
                        rows={4}
                        value={schema.description}
                        onChange={(event) => patchSchema((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>
                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={schema.placeholder}
                        onChange={(event) =>
                          patchSchema((current) => ({ ...current, placeholder: event.target.checked }))
                        }
                      />
                      <span>Placeholder content</span>
                    </label>
                  </div>
                </Panel>

                <Panel
                  title="Build + Unlock"
                  subtitle="These fields map directly to Chaos Core build costs and S.C.H.E.M.A. authorization unlock requirements."
                >
                  <div className="subsection">
                    <h4>Build Cost</h4>
                    <WalletFields
                      labelPrefix="Build cost"
                      wallet={schema.buildCost}
                      onChange={(nextWallet) => patchSchema((current) => ({ ...current, buildCost: nextWallet }))}
                    />
                  </div>

                  {schema.unlockSource === "schema" ? (
                    <div className="subsection">
                      <h4>Unlock Cost</h4>
                      <WalletFields
                        labelPrefix="Unlock cost"
                        wallet={schema.unlockCost}
                        onChange={(nextWallet) => patchSchema((current) => ({ ...current, unlockCost: nextWallet }))}
                      />
                      <div className="form-grid">
                        <label className="field">
                          <span>Unlock WAD cost</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.unlockWadCost}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                unlockWadCost: Number(event.target.value || 0)
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state compact">
                      Starter entries are immediately authorized in Chaos Core and do not use unlock costs.
                    </div>
                  )}

                  <div className="subsection">
                    <h4>Quest Gate</h4>
                    <div className="form-grid">
                      <label className="field full">
                        <span>Require completed quests</span>
                        <textarea
                          rows={3}
                          value={serializeStringList(schema.requiredQuestIds)}
                          placeholder="One quest id per line, or comma separated"
                          onChange={(event) =>
                            patchSchema((current) => ({
                              ...current,
                              requiredQuestIds: parseStringList(event.target.value)
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                </Panel>

                {!isFortification ? (
                  <Panel
                    title="Core Operations"
                    subtitle="Operational requirements, outputs, upkeep, and support values map directly to Chaos Core's core schema definitions."
                  >
                    <div className="subsection">
                      <h4>Operational Requirements</h4>
                      <div className="form-grid">
                        <label className="field">
                          <span>Power watts</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.operationalRequirements.powerWatts}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                operationalRequirements: {
                                  ...current.operationalRequirements,
                                  powerWatts: Number(event.target.value || 0)
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Comms BW</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.operationalRequirements.commsBw}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                operationalRequirements: {
                                  ...current.operationalRequirements,
                                  commsBw: Number(event.target.value || 0)
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Supply crates</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.operationalRequirements.supplyCrates}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                operationalRequirements: {
                                  ...current.operationalRequirements,
                                  supplyCrates: Number(event.target.value || 0)
                                }
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="subsection">
                      <h4>Outputs + Radius</h4>
                      <div className="form-grid">
                        <label className="field">
                          <span>Power output watts</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.powerOutputWatts}
                            onChange={(event) =>
                              patchSchema((current) => ({ ...current, powerOutputWatts: Number(event.target.value || 0) }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Power output mode</span>
                          <select
                            value={schema.powerOutputMode}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                powerOutputMode: event.target.value as SchemaDocument["powerOutputMode"]
                              }))
                            }
                          >
                            {schemaNetworkOutputModes.map((mode) => (
                              <option key={mode} value={mode}>
                                {formatOutputModeLabel(mode)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Comms output BW</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.commsOutputBw}
                            onChange={(event) =>
                              patchSchema((current) => ({ ...current, commsOutputBw: Number(event.target.value || 0) }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Comms output mode</span>
                          <select
                            value={schema.commsOutputMode}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                commsOutputMode: event.target.value as SchemaDocument["commsOutputMode"]
                              }))
                            }
                          >
                            {schemaNetworkOutputModes.map((mode) => (
                              <option key={mode} value={mode}>
                                {formatOutputModeLabel(mode)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Supply output crates</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.supplyOutputCrates}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                supplyOutputCrates: Number(event.target.value || 0)
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Supply output mode</span>
                          <select
                            value={schema.supplyOutputMode}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                supplyOutputMode: event.target.value as SchemaDocument["supplyOutputMode"]
                              }))
                            }
                          >
                            {schemaNetworkOutputModes.map((mode) => (
                              <option key={mode} value={mode}>
                                {formatOutputModeLabel(mode)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Support radius</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.supportRadius}
                            onChange={(event) =>
                              patchSchema((current) => ({ ...current, supportRadius: Number(event.target.value || 0) }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>WAD upkeep per tick</span>
                          <input
                            type="number"
                            min={0}
                            value={schema.wadUpkeepPerTick}
                            onChange={(event) =>
                              patchSchema((current) => ({
                                ...current,
                                wadUpkeepPerTick: Number(event.target.value || 0)
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="subsection">
                      <h4>Resource Upkeep</h4>
                      <WalletFields
                        labelPrefix="Upkeep"
                        wallet={schema.upkeep}
                        onChange={(nextWallet) => patchSchema((current) => ({ ...current, upkeep: nextWallet }))}
                      />
                    </div>

                    <div className="subsection">
                      <h4>Resource Income Per Tick</h4>
                      <WalletFields
                        labelPrefix="Income"
                        wallet={schema.incomePerTick}
                        onChange={(nextWallet) =>
                          patchSchema((current) => ({ ...current, incomePerTick: nextWallet }))
                        }
                      />
                    </div>
                  </Panel>
                ) : null}

                <Panel
                  title="Room Tags"
                  subtitle="Preferred room tags and tag output modifiers map to Chaos Core's native room-tag schema fields."
                >
                  <div className="subsection">
                    <h4>Preferred Room Tags</h4>
                    <div className="form-grid">
                      <label className="field full">
                        <span>Preferred room tags</span>
                        <textarea
                          rows={4}
                          value={serializeStringList(schema.preferredRoomTags)}
                          placeholder="One tag per line, or comma separated"
                          onChange={(event) => setPreferredRoomTags(parseStringList(event.target.value))}
                        />
                      </label>
                    </div>
                    <div className="empty-state compact">
                      Known tags: {schemaKnownRoomTags.map((tag) => formatTagLabel(tag)).join(", ")}
                    </div>
                    {customRoomTags.length > 0 ? (
                      <div className="empty-state compact">
                        Custom tags in this draft: {customRoomTags.join(", ")}
                      </div>
                    ) : null}
                  </div>

                  {!isFortification ? (
                    <div className="subsection">
                      <div className="item-card-header">
                        <h4>Tag Output Modifiers</h4>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() =>
                            patchSchema((current) => ({
                              ...current,
                              tagOutputModifiers: [...current.tagOutputModifiers, createSchemaTagOutputModifier()]
                            }))
                          }
                        >
                          Add modifier
                        </button>
                      </div>
                      {schema.tagOutputModifiers.length === 0 ? (
                        <div className="empty-state compact">No tag output modifiers yet.</div>
                      ) : null}
                      {schema.tagOutputModifiers.map((modifier, index) => (
                        <article key={modifier.id} className="item-card">
                          <div className="item-card-header">
                            <h3>Modifier {index + 1}</h3>
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() =>
                                patchSchema((current) => ({
                                  ...current,
                                  tagOutputModifiers: current.tagOutputModifiers.filter((entry) => entry.id !== modifier.id)
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                          <div className="form-grid">
                            <label className="field">
                              <span>Room tag</span>
                              <input
                                value={modifier.tag}
                                onChange={(event) =>
                                  updateModifier(modifier.id, (current) => ({ ...current, tag: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field full">
                              <span>Note</span>
                              <input
                                value={modifier.note}
                                onChange={(event) =>
                                  updateModifier(modifier.id, (current) => ({ ...current, note: event.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <WalletFields
                            labelPrefix="Bonus output"
                            wallet={modifier.output}
                            onChange={(nextWallet) =>
                              updateModifier(modifier.id, (current) => ({ ...current, output: nextWallet }))
                            }
                          />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state compact">
                      Fortifications use preferred room tags, but they do not use tag output modifiers in Chaos Core.
                    </div>
                  )}
                </Panel>
              </div>

              <div className="tool-suite-column">
                <Panel
                  title="Runtime Preview"
                  subtitle="This is the native Chaos Core schema shape the current draft will publish."
                >
                  <div className="toolbar">
                    <span className="pill">{schema.kind}</span>
                    {schema.shortCode.trim() ? <span className="pill">{schema.shortCode.trim()}</span> : null}
                    {schema.unlockSource ? <span className="pill">{schema.unlockSource}</span> : null}
                    {schema.requiredQuestIds.length > 0 ? <span className="pill">{schema.requiredQuestIds.length} quest gate(s)</span> : null}
                    {schema.placeholder ? <span className="pill">placeholder</span> : null}
                  </div>
                  <pre className="json-preview">{JSON.stringify(runtimePreview, null, 2)}</pre>
                </Panel>
              </div>
            </div>

            <ChaosCoreDatabasePanel
              contentType="schema"
              currentDocument={schema}
              buildBundle={(current) => buildSchemaBundleForTarget(normalize(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Load and revise live Chaos Core schema definitions like Mine, Armory, and fortification authorizations directly from the game repo."
            />
          </div>
        );
      }}
    />
  );
}
