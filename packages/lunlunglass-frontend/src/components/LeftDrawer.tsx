import { useState, useEffect } from "react";
import { Drawer } from "antd";
import "./LeftDrawer.css";

interface LeftDrawerProps {
  children?: React.ReactNode;
}

const LeftDrawer: React.FC<LeftDrawerProps> = ({ children }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 检测鼠标是否靠近左侧边缘（20px 范围内）
      const triggerDistance = 20;

      if (e.clientX <= triggerDistance) {
        // 鼠标靠近左侧，打开抽屉
        setOpen(true);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (!open) return;

      const drawerElement = document.querySelector(".left-drawer-root .ant-drawer-content-wrapper");
      if (drawerElement) {
        const rect = drawerElement.getBoundingClientRect();
        const isInDrawer =
          e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!isInDrawer) {
          // 点击抽屉外部，关闭抽屉
          setOpen(false);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClickOutside);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [open]);

  return (
    <>
      {/* 触发区域 */}
      <div className="left-drawer-trigger" />

      <Drawer
        title={null}
        placement="left"
        closable={false}
        mask={false}
        open={open}
        onClose={() => setOpen(false)}
        width={300}
        className="left-drawer"
        rootClassName="left-drawer-root"
      >
        {children || <div>抽屉内容</div>}
      </Drawer>
    </>
  );
};

export default LeftDrawer;
