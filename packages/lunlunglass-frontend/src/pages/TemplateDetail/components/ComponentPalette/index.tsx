import React from "react";
import styles from "./index.module.scss";
import { LineComponent } from "../LineComponent";
import { CircleComponent } from "../CircleComponent";
import { RectangleComponent } from "../RectangleComponent";
import { TextComponent } from "../TextComponent";
import { ImageComponent } from "../ImageComponent";

export interface ComponentDragData {
  viewType: "GraphView" | "TextView" | "ImageView";
  graphType?: "Line" | "Circle" | "Rectangle";
  constructorParams: any;
}

const ComponentPalette: React.FC = () => {
  const handleDragStart = (e: React.DragEvent, data: ComponentDragData) => {
    e.dataTransfer.setData("application/json", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className={styles.componentPalette}>
      <h3 className={styles.title}>组件列表</h3>
      <div className={styles.components}>
        <LineComponent
          onDragStart={(e) =>
            handleDragStart(e, {
              viewType: "GraphView",
              graphType: "Line",
              constructorParams: {
                startPoint: { x: 0, y: 0, z: 0 },
                endPoint: { x: 100, y: 100, z: 0 },
              },
            })
          }
        />
        <CircleComponent
          onDragStart={(e) =>
            handleDragStart(e, {
              viewType: "GraphView",
              graphType: "Circle",
              constructorParams: {
                center: { x: 50, y: 50, z: 0 },
                radius: 50,
              },
            })
          }
        />
        <RectangleComponent
          onDragStart={(e) =>
            handleDragStart(e, {
              viewType: "GraphView",
              graphType: "Rectangle",
              constructorParams: {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            })
          }
        />
        <TextComponent
          onDragStart={(e) =>
            handleDragStart(e, {
              viewType: "TextView",
              constructorParams: {
                text: "文本",
              },
            })
          }
        />
        <ImageComponent
          onDragStart={(e) =>
            handleDragStart(e, {
              viewType: "ImageView",
              constructorParams: {
                x: 0,
                y: 0,
                imageSrc: "https://picsum.photos/200/300",
              },
            })
          }
        />
      </div>
    </div>
  );
};

export default ComponentPalette;

