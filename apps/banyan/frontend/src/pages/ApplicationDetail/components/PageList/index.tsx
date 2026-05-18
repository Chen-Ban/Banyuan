import React, { useMemo, useState, useRef, useEffect } from "react";
import { Tree, Button, TreeNodeProps } from "antd";
import {
  PlusOutlined,
  DownOutlined,
  RightOutlined,
  CloseOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  LockOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import type { IPageNode, IViewNode, IBanvasActions } from "banvasgl";
import styles from "./index.module.scss";

interface PageListProps {
  pages: IPageNode[];
  currentPageId: string | null;
  actions: IBanvasActions;
}

interface TreeNode {
  key: string;
  title: string;
  isPage: boolean;
  visible?: boolean;
  locked?: boolean;
  children?: TreeNode[];
  isLeaf?: boolean;
}

/** 判断 key 是否为页面节点 */
function isPageKey(pages: IPageNode[], key: string): boolean {
  return pages.some((p) => p.id === key);
}

/** 查找 view 所属的页面 ID */
function findOwnerPageId(pages: IPageNode[], viewId: string): string | null {
  for (const page of pages) {
    const found = (function search(nodes: IViewNode[]): boolean {
      return nodes.some(
        (n) => n.id === viewId || (n.children && search(n.children)),
      );
    })(page.children || []);
    if (found) return page.id;
  }
  return null;
}

/** 独立的 InlineEdit 组件 */
const InlineEdit: React.FC<{
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}> = ({ defaultValue, onCommit, onCancel }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.select();
      }
    });
  }, []);

  const doCommit = () => {
    if (committed) return;
    setCommitted(true);
    const value = ref.current?.value ?? "";
    const trimmed = value.trim();
    if (trimmed) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={ref}
      className={styles.renameInput}
      defaultValue={defaultValue}
      onBlur={doCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doCommit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
};

const PageList: React.FC<PageListProps> = ({
  pages,
  currentPageId,
  actions,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  /** 构建纯数据 treeData */
  const treeData: TreeNode[] = useMemo(() => {
    function viewToNode(v: IViewNode): TreeNode {
      return {
        key: v.id,
        title: v.name || v.type,
        isPage: false,
        visible: v.visible,
        locked: v.locked,
        children: v.children?.length ? v.children.map(viewToNode) : undefined,
        isLeaf: !v.children?.length,
      };
    }
    return pages.map((page) => ({
      key: page.id,
      title: page.name,
      isPage: true,
      children: page.children?.map(viewToNode) || [],
    }));
  }, [pages]);

  /** 删除节点 */
  const handleDelete = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPageKey(pages, key)) {
      if (pages.length <= 1) return;
      actions.page.remove(key);
    } else {
      actions.view.delete(key);
    }
  };

  /** 是否允许显示删除按钮 */
  const canDelete = (node: TreeNode): boolean => {
    if (node.isPage && pages.length <= 1) return false;
    return true;
  };

  /** titleRender */
  const titleRender = (node: TreeNode) => {
    if (editingKey === node.key) {
      return (
        <InlineEdit
          defaultValue={node.title}
          onCommit={(val) => {
            if (node.isPage) {
              actions.page.rename(node.key, val);
            } else {
              actions.view.rename(node.key, val);
            }
            setEditingKey(null);
          }}
          onCancel={() => setEditingKey(null)}
        />
      );
    }

    return (
      <span
        className={styles.nodeTitleWrapper}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingKey(node.key);
        }}
      >
        <span className={styles.nodeTitle}>{node.title}</span>

        <span className={styles.nodeBtns}>
          {/* 锁定/解锁（仅 view 节点） */}
          {!node.isPage && (
            <span
              className={`${styles.nodeBtn} ${node.locked ? styles.nodeBtnActive : ""}`}
              title={node.locked ? "解锁" : "锁定"}
              onClick={(e) => {
                e.stopPropagation();
                actions.view.setLocked(node.key, !node.locked);
              }}
            >
              {node.locked ? (
                <LockOutlined style={{ fontSize: 11 }} />
              ) : (
                <UnlockOutlined style={{ fontSize: 11 }} />
              )}
            </span>
          )}

          {/* 可见/隐藏（仅 view 节点） */}
          {!node.isPage && (
            <span
              className={`${styles.nodeBtn} ${!node.visible ? styles.nodeBtnActive : ""}`}
              title={node.visible ? "隐藏" : "显示"}
              onClick={(e) => {
                e.stopPropagation();
                actions.view.setVisible(node.key, !node.visible);
              }}
            >
              {node.visible ? (
                <EyeOutlined style={{ fontSize: 11 }} />
              ) : (
                <EyeInvisibleOutlined style={{ fontSize: 11 }} />
              )}
            </span>
          )}

          {/* 删除 */}
          {canDelete(node) && (
            <span
              className={`${styles.nodeBtn} ${styles.nodeBtnDanger}`}
              title="删除"
              onClick={(e) => handleDelete(node.key, e)}
            >
              <CloseOutlined style={{ fontSize: 10 }} />
            </span>
          )}
        </span>
      </span>
    );
  };

  // 选中高亮
  const selectedKeys = useMemo(() => {
    const keys: string[] = [];
    function collectActived(nodes: IViewNode[]) {
      for (const node of nodes) {
        if (node.actived) keys.push(node.id);
        if (node.children) collectActived(node.children);
      }
    }
    for (const page of pages) {
      collectActived(page.children || []);
    }
    if (keys.length === 0 && currentPageId) {
      keys.push(currentPageId);
    }
    return keys;
  }, [pages, currentPageId]);

  // 始终展开所有页面节点，以及所有有子节点的 view 节点（如 CombinedView）
  const expandedKeys = useMemo(() => {
    const keys: string[] = pages.map((p) => p.id);
    function collectExpandable(nodes: IViewNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          keys.push(node.id);
          collectExpandable(node.children);
        }
      }
    }
    for (const page of pages) {
      collectExpandable(page.children || []);
    }
    return keys;
  }, [pages]);

  const handleSelect = (
    _keys: React.Key[],
    info: { node: { key: React.Key }; nativeEvent: MouseEvent },
  ) => {
    const key = info.node.key as string;
    if (!key) {
      actions.view.deselect();
      return;
    }

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const isCtrl = isMac ? info.nativeEvent.metaKey : info.nativeEvent.ctrlKey;
    if (isPageKey(pages, key)) {
      actions.view.deselect();
      actions.page.navigateTo(key);
    } else {
      const ownerPageId = findOwnerPageId(pages, key);
      if (ownerPageId && ownerPageId !== currentPageId) {
        actions.view.deselect();
        actions.page.navigateTo(ownerPageId);
        actions.view.select(key);
      } else {
        actions.view.select(key, isCtrl);
      }
    }
  };

  return (
    <div className={styles.pageList}>
      <div className={styles.header}>
        <span className={styles.title}>页面</span>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => actions.page.add()}
        />
      </div>
      <div className={styles.treeWrapper}>
        <Tree<TreeNode>
          treeData={treeData}
          titleRender={titleRender}
          selectedKeys={selectedKeys}
          expandedKeys={expandedKeys}
          onSelect={handleSelect}
          multiple
          blockNode
          motion={null}
          showLine={{ showLeafIcon: false }}
          switcherIcon={(props: TreeNodeProps) =>
            props.expanded ? (
              <DownOutlined style={{ fontSize: 10 }} />
            ) : (
              <RightOutlined style={{ fontSize: 10 }} />
            )
          }
        />
      </div>
    </div>
  );
};

export default PageList;
