import React from "react";
import styles from "./index.module.scss";

interface LineComponentProps {
  onDragStart: (e: React.DragEvent) => void;
}

export const LineComponent: React.FC<LineComponentProps> = ({ onDragStart }) => {
  return (
    <div
      className={styles.lineComponent}
      draggable
      onDragStart={onDragStart}
    >
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <line x1="5" y1="5" x2="35" y2="35" stroke="#1890ff" strokeWidth="2" />
        </svg>
      </div>
      <span className={styles.label}>直线</span>
    </div>
  );
};

