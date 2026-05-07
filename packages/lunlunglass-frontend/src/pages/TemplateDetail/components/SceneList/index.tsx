import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Tree, Button } from "antd";
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

/** 查找节点原始名称 */
function findNodeName(pages: IPageNode[], key: string): string {
  for (const page of pages) {
    if (page.id === key) return page.name;
    const found = findViewName(page.children, key);
    if (found) return found;
  }
  return "";
}

function findViewName(
  views: IViewNode[] | undefined,
  key: string,
): string | null {
  if (!views) return null;
  for (const v of views) {
    if (v.id === key) return v.name || v.type;
    const found = findViewName(v.children, key);
    if (found) return found;
  }
  return null;
}

const SceneList: React.FC<SceneListProps> = ({
  pages,
  currentPageId,
  selectedViewId,
  actions,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 双击进入编辑时自动聚焦
  useEffect(() => {
    if (editingKey) {
      // 延迟一帧确保 DOM 已渲染
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    }
  }, [editingKey]);

  /** 提交重命名 */
  const commitRename = useCallback(() => {
    if (!editingKey) return;
    const trimmed = editingValue.trim();
    if (trimmed) {
      if (isPageKey(pages, editingKey)) {
        actions.page.rename(editingKey, trimmed);
      } else {
        actions.view.rename(editingKey, trimmed);
      }
    }
    setEditingKey(null);
    setEditingValue("");
  }, [editingKey, editingValue, pages, actions]);

  /** 取消编辑 */
  const cancelRename = useCallback(() => {
    setEditingKey(null);
    setEditingValue("");
  }, []);

  /** 构建纯数据树（title 为 string） */
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
      // 点击已选中节点取消选中
      actions.view.deselect();
      return;
    }

    if (isPageKey(pages, key)) {
      actions.page.navigateTo(key);
      actions.view.deselect();
    } else {
      actions.view.select(key);
    }
  };

  /** 自定义 titleRender：支持双击编辑 */
  const titleRender = useCallback(
    (nodeData: TreeNode) => {
      const { key, title } = nodeData;

      if (editingKey === key) {
        return (
          <input
            ref={inputRef}
            className={styles.renameInput}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        );
      }

      return (
        <span
          className={styles.nodeTitle}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingKey(key);
            setEditingValue(title);
          }}
        >
          {title}
        </span>
      );
    },
    [editingKey, editingValue, commitRename, cancelRename],
  );

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
          selectedKeys={selectedKeys}
          defaultExpandedKeys={expandedKeys}
          onSelect={handleSelect}
          titleRender={titleRender}
          blockNode
          showLine={{ showLeafIcon: false }}
          switcherIcon={(props: any) =>
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
