import React, { useMemo, useState, useRef, useEffect } from "react";
import { Tree, Button, TreeNodeProps } from "antd";
import { PlusOutlined, DownOutlined, RightOutlined, CloseOutlined } from "@ant-design/icons";
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

  /** 删除节点 */
  const handleDelete = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPageKey(pages, key)) {
      // 禁止删除最后一个页面
      if (pages.length <= 1) return;
      actions.page.remove(key);
    } else {
      actions.view.delete(key);
    }
  };

  /** 是否允许显示删除按钮 */
  const canDelete = (node: TreeNode): boolean => {
    // 如果是页面节点且只剩最后一个，不允许删除
    if (isPageKey(pages, node.key) && pages.length <= 1) return false;
    return true;
  };

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
        className={styles.nodeTitleWrapper}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingKey(node.key);
        }}
      >
        <span className={styles.nodeTitle}>{node.title}</span>
        {canDelete(node) && (
          <span
            className={styles.deleteBtn}
            onClick={(e) => handleDelete(node.key, e)}
          >
            <CloseOutlined />
          </span>
        )}
      </span>
    );
  };

  // 选中高亮：收集所有 actived 的节点
  const selectedKeys = useMemo(() => {
    const keys: string[] = [];
    function collectActived(nodes: IViewNode[]) {
      for (const node of nodes) {
        if (node.actived) keys.push(node.id);
        if (node.children) collectActived(node.children);
      }
    }
    for (const page of pages) {
      if (
        page.isCurrent &&
        keys.length === 0 &&
        !pages.some((p) => p.children?.some((c) => c.actived))
      ) {
        // 如果当前页面没有任何 actived 节点，高亮页面本身
      }
      collectActived(page.children || []);
    }
    // 如果没有任何 actived 节点，高亮当前页面
    if (keys.length === 0 && currentPageId) {
      keys.push(currentPageId);
    }
    return keys;
  }, [pages, currentPageId]);

  // 始终展开所有页面节点（受控模式，响应 pages 变化）
  const expandedKeys = useMemo(() => pages.map((p) => p.id), [pages]);

  const handleSelect = (
    _keys: React.Key[],
    info: { node: { key: React.Key }; nativeEvent: MouseEvent },
  ) => {
    const key = info.node.key as string;
    if (!key) {
      actions.view.deselect();
      return;
    }

    // macOS 上 Ctrl+Click 会触发系统右键菜单，多选应使用 Cmd(metaKey)
    // Windows/Linux 上多选使用 Ctrl(ctrlKey)
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const isCtrl = isMac ? info.nativeEvent.metaKey : info.nativeEvent.ctrlKey;

    if (isPageKey(pages, key)) {
      // 点击页面节点：切换页面并取消选中
      actions.view.deselect();
      actions.page.navigateTo(key);
    } else {
      // 点击 view 节点
      const ownerPageId = findOwnerPageId(pages, key);
      if (ownerPageId && ownerPageId !== currentPageId) {
        // 跨页面：不允许多选，先清除再切换页面后单选
        actions.view.deselect();
        actions.page.navigateTo(ownerPageId);
        actions.view.select(key);
      } else {
        // 同页面：Ctrl 多选，否则单选
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
