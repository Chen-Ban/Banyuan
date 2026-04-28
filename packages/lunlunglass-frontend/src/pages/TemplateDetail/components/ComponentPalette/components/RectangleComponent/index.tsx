import React from "react";
import styles from "./index.module.scss";

interface RectangleComponentProps {
  onDragStart: (e: React.DragEvent) => void;
}

export const RectangleComponent: React.FC<RectangleComponentProps> = ({ onDragStart }) => {
  return (
    <div
      className={styles.rectangleComponent}
      draggable
      onDragStart={onDragStart}
    >
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <rect x="5" y="5" width="30" height="30" fill="none" stroke="#1890ff" strokeWidth="2" />
        </svg>
      </div>
      <span className={styles.label}>矩形</span>
    </div>
  );
};

