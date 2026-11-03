import { useLocale } from "@/i18n";
import { useRef, type RefObject } from "react";
import * as Tooltip from "@/ui/canvas-tooltip";
import { ComponentType, COMPONENT_CONFIGS } from "../../config/components";

interface QuickCreateMenuProps {
  position: "left" | "right";
  onCreateComponent: (type: ComponentType) => void;
  anchorRef: RefObject<HTMLElement>;
}

export function QuickCreateMenu({
  position,
  onCreateComponent,
}: QuickCreateMenuProps) {
  useLocale();
  const menuRef = useRef<HTMLDivElement>(null);

  // 获取可创建的组件类型（排除 ai-draw）
  const availableComponents = Object.entries(COMPONENT_CONFIGS).filter(
    ([type]) => type !== "ai-draw",
  );

  // 计算菜单位置 - 使用absolute定位相对于圆点
  const getMenuPosition = () => {
    const baseStyles = {
      position: "absolute" as const,
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: 99999, // 确保在圆点之上
    };

    if (position === "left") {
      return {
        ...baseStyles,
        right: "calc(100% + 8px)", // 菜单在圆点左侧，距离8px
      };
    } else {
      return {
        ...baseStyles,
        left: "calc(100% + 8px)", // 菜单在圆点右侧，距离8px
      };
    }
  };

  return (
    <Tooltip.Provider>
      <div
        ref={menuRef}
        className="quick-create-menu bg-popover rounded-xl shadow-lg border border-border p-1 flex flex-col gap-0.5 relative"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        style={{
          ...getMenuPosition(),
          width: "40px", // 更小的宽度
          pointerEvents: "all",
        }}
      >
        {/* 指向圆点的三角箭头 - 边框 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0 h-0"
          style={{
            [position === "left" ? "right" : "left"]: "-7px", // 边框三角箭头位置
            borderTop: "7px solid transparent",
            borderBottom: "7px solid transparent",
            [position === "left" ? "borderLeft" : "borderRight"]:
              "7px solid #d1d5db", // 边框颜色
            zIndex: 1,
          }}
        />
        {/* 指向圆点的三角箭头 - 内容 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0 h-0"
          style={{
            [position === "left" ? "right" : "left"]: "-6px", // 内容三角箭头位置
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            [position === "left" ? "borderLeft" : "borderRight"]:
              "6px solid white",
            zIndex: 2,
          }}
        />
        {availableComponents.map(([type, config]) => {
          const IconComponent = config.icon;
          return (
            <Tooltip.Root key={type}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onCreateComponent(type as ComponentType);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors cursor-pointer"
                  style={{
                    touchAction: "none",
                    userSelect: "none",
                    pointerEvents: "all",
                  }}
                  type="button"
                >
                  <IconComponent size={16} className="text-foreground" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side={position === "left" ? "left" : "right"}
                  sideOffset={8}
                  className="px-2 py-1 text-sm text-white bg-gray-900 rounded-md shadow-lg"
                >
                  {config.displayName}
                  <Tooltip.Arrow className="fill-gray-900" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}
