import React, { useMemo, useState, useRef, useEffect } from "react";
import { Tree, Button, TreeNodeProps } from "antd";
import { PlusOutlined, DownOutlined, RightOutlined } from "@ant-design/icons";
import type { IPageNode, IViewNode, IBanvasActions } from "banvasgl";
import styles from "./index.module.scss";

interface SceneListProps {
  pages: IPageNode[];
  currentPageId: string | null;
  selectedViewId: string;
  actions: IBanvasActions;
}

interface TreeNode {
  key: string;
  title: string;
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
      return nodes.some((n) => n.id === viewId || (n.children && search(n.children)));
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

const SceneList: React.FC<SceneListProps> = ({
  pages,
  currentPageId,
  selectedViewId,
  actions,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  /** 构建纯数据 treeData（title 为字符串） */
  const treeData: TreeNode[] = useMemo(() => {
    function viewToNode(v: IViewNode): TreeNode {
      return {
        key: v.id,
        title: v.name || v.type,
        children: v.children?.length ? v.children.map(viewToNode) : undefined,
        isLeaf: !v.children?.length,
      };
    }
    return pages.map((page) => ({
      key: page.id,
      title: page.name,
      children: page.children?.map(viewToNode) || [],
    }));
  }, [pages]);

  /** titleRender：根据编辑状态渲染节点 */
  const titleRender = (node: TreeNode) => {
    if (editingKey === node.key) {
      return (
        <InlineEdit
          defaultValue={node.title}
          onCommit={(val) => {
            if (isPageKey(pages, node.key)) {
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
        className={styles.nodeTitle}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingKey(node.key);
        }}
      >
        {node.title}
      </span>
    );
  };

  // 选中高亮
  const selectedKeys = useMemo(() => {
    const keys: string[] = [];
    if (selectedViewId) keys.push(selectedViewId);
    else if (currentPageId) keys.push(currentPageId);
    return keys;
  }, [selectedViewId, currentPageId]);

  // 展开所有页面
  const expandedKeys = useMemo(() => pages.map((p) => p.id), [pages]);

  const handleSelect = (keys: React.Key[]) => {
    const key = (keys.length > 0 ? keys[0] : null) as string | null;
    if (!key) {
      actions.view.deselect();
      return;
    }

    if (isPageKey(pages, key)) {
      // 点击页面节点：切换页面并取消选中
      actions.page.navigateTo(key);
      actions.view.deselect();
    } else {
      // 点击 view 节点：若不在当前页面则先切换
      const ownerPageId = findOwnerPageId(pages, key);
      if (ownerPageId && ownerPageId !== currentPageId) {
        actions.page.navigateTo(ownerPageId);
      }
      actions.view.select(key);
    }
  };

  return (
    <div className={styles.sceneList}>
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
          defaultExpandedKeys={expandedKeys}
          onSelect={handleSelect}
          blockNode
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

export default SceneList;
