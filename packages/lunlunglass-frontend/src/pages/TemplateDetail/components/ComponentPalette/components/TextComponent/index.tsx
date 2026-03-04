import React from "react";
import styles from "./index.module.scss";

interface TextComponentProps {
  onDragStart: (e: React.DragEvent) => void;
}

export const TextComponent: React.FC<TextComponentProps> = ({ onDragStart }) => {
  return (
    <div
      className={styles.textComponent}
      draggable
      onDragStart={onDragStart}
    >
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <text x="20" y="25" textAnchor="middle" fontSize="16" fill="#1890ff" fontWeight="bold">
            T
          </text>
        </svg>
      </div>
      <span className={styles.label}>文本</span>
    </div>
  );
};

