import React from "react";
import styles from "./index.module.scss";

interface CircleComponentProps {
  onDragStart: (e: React.DragEvent) => void;
}

export const CircleComponent: React.FC<CircleComponentProps> = ({ onDragStart }) => {
  return (
    <div
      className={styles.circleComponent}
      draggable
      onDragStart={onDragStart}
    >
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="15" fill="none" stroke="#1890ff" strokeWidth="2" />
        </svg>
      </div>
      <span className={styles.label}>圆形</span>
    </div>
  );
};

