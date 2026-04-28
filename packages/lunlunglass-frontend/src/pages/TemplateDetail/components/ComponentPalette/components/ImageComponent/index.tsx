import React from "react";
import styles from "./index.module.scss";

interface ImageComponentProps {
  onDragStart: (e: React.DragEvent) => void;
}

export const ImageComponent: React.FC<ImageComponentProps> = ({ onDragStart }) => {
  return (
    <div
      className={styles.imageComponent}
      draggable
      onDragStart={onDragStart}
    >
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <rect x="5" y="8" width="30" height="24" fill="none" stroke="#1890ff" strokeWidth="2" />
          <circle cx="12" cy="16" r="3" fill="#1890ff" />
          <line x1="5" y1="24" x2="20" y2="18" stroke="#1890ff" strokeWidth="2" />
          <line x1="20" y1="18" x2="35" y2="24" stroke="#1890ff" strokeWidth="2" />
        </svg>
      </div>
      <span className={styles.label}>图片</span>
    </div>
  );
};

