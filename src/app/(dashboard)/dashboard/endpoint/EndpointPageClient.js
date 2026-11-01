"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input, Modal, CardSkeleton, Toggle, ConfirmModal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import useSettingsStore from "@/store/settingsStore";
import EndpointRow from "./components/EndpointRow";
import KeyAccessControls from "./components/KeyAccessControls";

export default function APIPageClient({ machineId }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const [requireApiKey, setRequireApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("http://localhost:20129/v1");
  const { copied, copy } = useCopyToClipboard(2000);

  // Key Access modal state
  const [accessModalKey, setAccessModalKey] = useState(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch (error) {
      console.log("Error fetching keys:", error);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const settingsData = await useSettingsStore.getState().fetchSettings();
      if (settingsData) {
        setRequireApiKey(settingsData.requireApiKey ?? false);
      }
    } catch (err) {
      console.log("Error fetching settings:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/v1`);
    }
    Promise.all([fetchKeys(), loadSettings()]).finally(() => setLoading(false));
  }, [fetchKeys, loadSettings]);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Default Key" }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.key);
        setNewKeyName("");
        fetchKeys();
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchKeys();
      }
    } catch (error) {
      console.log("Error deleting key:", error);
    }
  };

  const handleToggleKey = async (id, currentStatus) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (res.ok) {
        fetchKeys();
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  };

  const handleRequireApiKeyToggle = async (value) => {
    setRequireApiKey(value);
    try {
      const updated = await useSettingsStore.getState().patchSettings({ requireApiKey: value });
      if (!updated) {
        setRequireApiKey(!value);
      }
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
      setRequireApiKey(!value);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Endpoint Card */}
      <Card>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">api</span>
          API Endpoint
        </h2>

        {/* Endpoint row */}
        <div className="flex flex-col gap-2">
          <EndpointRow
            label="Local"
            url={baseUrl}
            copyId="local_url"
            copied={copied}
            onCopy={copy}
          />
        </div>
      </Card>

      {/* API Keys */}
      <Card id="require-api-key">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">vpn_key</span>
            API Keys
          </h2>
          <Button icon="add" onClick={() => setShowAddModal(true)}>
            Create Key
          </Button>
        </div>

        {/* Global requireApiKey toggle */}
        <div className="mb-4 p-3 rounded-lg bg-surface-2/50 border border-border flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Require API key for requests</p>
            <p className="text-xs text-text-muted">
              When disabled, any request without a Bearer token uses the default key.
            </p>
          </div>
          <Toggle
            checked={requireApiKey}
            onChange={() => handleRequireApiKeyToggle(!requireApiKey)}
          />
        </div>

        {/* Keys Table */}
        {keys.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            No API keys created yet. Create one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Key</th>
                  <th className="pb-3 font-medium">Access</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-surface-2/30">
                    <td className="py-3 font-medium">{k.name}</td>
                    <td className="py-3 font-mono text-xs text-text-muted">
                      {k.key ? `${k.key.slice(0, 10)}...${k.key.slice(-4)}` : "—"}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => setAccessModalKey(k)}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          k.accessRestricted
                            ? "border-primary/40 bg-primary/10 text-primary font-medium"
                            : "border-border text-text-muted hover:border-border-subtle"
                        }`}
                      >
                        {k.accessRestricted ? "Restricted" : "Full Access"}
                      </button>
                    </td>
                    <td className="py-3">
                      <Toggle
                        checked={k.isActive !== false}
                        onChange={() => handleToggleKey(k.id, k.isActive !== false)}
                      />
                    </td>
                    <td className="py-3 text-xs text-text-muted">
                      {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() =>
                          setConfirmState({
                            title: "Delete API Key",
                            message: `Are you sure you want to delete "${k.name}"? This action cannot be undone.`,
                            onConfirm: () => handleDeleteKey(k.id),
                          })
                        }
                        className="p-1 hover:bg-red-500/10 text-text-muted hover:text-red-500 rounded transition-colors"
                        title="Delete key"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Key Modal */}
      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => setShowAddModal(false)}
      >
        <form onSubmit={handleCreateKey} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1">Key Name</label>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Cursor, Claude Code"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>

      {/* Show Created Key Modal */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Make sure to copy your API key now. You will not be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <Input value={createdKey?.key || ""} readOnly className="font-mono text-sm" />
            <Button
              onClick={() => copy(createdKey?.key, "new_key")}
              icon={copied === "new_key" ? "check" : "content_copy"}
            >
              {copied === "new_key" ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Key Access Modal */}
      {accessModalKey && (
        <KeyAccessControls
          apiKey={accessModalKey}
          onClose={() => setAccessModalKey(null)}
          onSave={() => {
            setAccessModalKey(null);
            fetchKeys();
          }}
        />
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

APIPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
