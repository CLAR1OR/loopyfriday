"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  addCommentAction,
  deleteCommentAction,
  listCommentsAction,
} from "@/server/comment-actions";
import type { CommentNode } from "@/server/comments";
import type { CommentEntity } from "@/server/db/schema";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Comments({
  entityType,
  entityId,
  currentUserId,
  isAdmin,
}: {
  entityType: CommentEntity;
  entityId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [nodes, setNodes] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listCommentsAction({ entityType, entityId })
      .then((data) => active && setNodes(data))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  async function add(body: string, parentId: string | null) {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const node = await addCommentAction({
        entityType,
        entityId,
        parentId,
        body,
      });
      setNodes((prev) => {
        if (!parentId) return [...prev, node];
        return prev.map((n) =>
          n.id === parentId ? { ...n, replies: [...n.replies, node] } : n,
        );
      });
      setReplyTo(null);
    } finally {
      setBusy(false);
    }
  }

  function markDeleted(id: string) {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === id)
          return { ...n, deleted: true, body: null, authorName: null };
        return {
          ...n,
          replies: n.replies.map((r) =>
            r.id === id
              ? { ...r, deleted: true, body: null, authorName: null }
              : r,
          ),
        };
      }),
    );
  }

  async function del(id: string) {
    await deleteCommentAction({ commentId: id }).then(() => markDeleted(id));
  }

  const canDelete = (n: CommentNode) =>
    !n.deleted && (isAdmin || n.authorId === currentUserId);

  function Item({ node, isReply }: { node: CommentNode; isReply: boolean }) {
    return (
      <div className={isReply ? "ml-6 border-l pl-3" : ""}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">
            {node.deleted ? "—" : (node.authorName ?? "Someone")}
          </span>
          <span className="text-xs text-muted-foreground">
            {fmt(node.createdAt)}
          </span>
          {canDelete(node) ? (
            <button
              type="button"
              onClick={() => del(node.id)}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive"
            >
              Delete
            </button>
          ) : null}
        </div>
        <p
          className={`whitespace-pre-wrap text-sm ${
            node.deleted ? "italic text-muted-foreground" : ""
          }`}
        >
          {node.deleted ? "[deleted]" : node.body}
        </p>
        {!isReply && !node.deleted ? (
          <button
            type="button"
            onClick={() => setReplyTo(replyTo === node.id ? null : node.id)}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Reply
          </button>
        ) : null}
        {node.replies.map((r) => (
          <div key={r.id} className="mt-2">
            <Item node={r} isReply />
          </div>
        ))}
        {replyTo === node.id ? (
          <div className="mt-2 ml-6">
            <CommentInput
              placeholder="Write a reply…"
              busy={busy}
              onSubmit={(b) => add(b, node.id)}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : (
        <>
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            <div className="space-y-4">
              {nodes.map((n) => (
                <Item key={n.id} node={n} isReply={false} />
              ))}
            </div>
          )}
          <CommentInput
            placeholder="Add a comment…"
            busy={busy}
            onSubmit={(b) => add(b, null)}
          />
        </>
      )}
    </div>
  );
}

function CommentInput({
  placeholder,
  busy,
  onSubmit,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (body: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Button
        size="sm"
        disabled={busy || !value.trim()}
        onClick={() => {
          onSubmit(value);
          setValue("");
        }}
      >
        {busy ? "Posting…" : "Post"}
      </Button>
    </div>
  );
}
