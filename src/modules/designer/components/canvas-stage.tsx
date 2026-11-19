"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Image as KonvaImage,
  Line,
  Transformer,
  Group,
} from "react-konva";
import { CanvasElement, PrintBoundsInPixels, TextCanvasElement, ImageCanvasElement, ShapeCanvasElement } from "../types";
import Konva from "konva";

// Lightweight native image hook for Konva (no external use-image package required)
function useNativeImage(src: string): [HTMLImageElement | undefined] {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  useEffect(() => {
    if (!src || typeof window === "undefined") return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => setImage(img);
  }, [src]);
  return [image];
}

interface CanvasStageProps {
  bounds: PrintBoundsInPixels;
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (updatedElements: CanvasElement[]) => void;
  showBleedGuide: boolean;
  showTrimGuide: boolean;
  showSafeGuide: boolean;
  showGuides?: boolean;
  backgroundColor: string;
  stageRef: React.RefObject<Konva.Stage | null>;
}

// Subcomponent for rendering images with use-image
function KonvaURLImage({
  element,
  onSelect,
  onChange,
}: {
  element: ImageCanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newAttrs: Partial<ImageCanvasElement>) => void;
}) {
  const [image] = useNativeImage(element.src);
  const shapeRef = useRef<Konva.Image>(null);

  return (
    <KonvaImage
      ref={shapeRef}
      image={image}
      id={element.id}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      opacity={element.opacity}
      draggable={!element.isLocked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        onChange({
          x: e.target.x(),
          y: e.target.y(),
        });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: node.x(),
          y: node.y(),
          width: Math.max(10, node.width() * scaleX),
          height: Math.max(10, node.height() * scaleY),
          rotation: node.rotation(),
        });
      }}
    />
  );
}

export function CanvasStage({
  bounds,
  elements,
  selectedId,
  onSelect,
  onChange,
  showBleedGuide,
  showTrimGuide,
  showSafeGuide,
  showGuides = true,
  backgroundColor,
  stageRef,
}: CanvasStageProps) {
  const trRef = useRef<Konva.Transformer>(null);

  // Synchronize transformer selection
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    if (selectedId) {
      const selectedNode = stageRef.current.findOne(`#${selectedId}`);
      if (selectedNode) {
        trRef.current.nodes([selectedNode]);
        trRef.current.getLayer()?.batchDraw();
        return;
      }
    }
    trRef.current.nodes([]);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedId, stageRef, elements]);

  const handleElementUpdate = (id: string, newAttrs: Partial<CanvasElement>) => {
    const updated = elements.map((el) => (el.id === id ? ({ ...el, ...newAttrs } as CanvasElement) : el));
    onChange(updated);
  };

  const checkDeselect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // If clicked on empty background, deselect
    if (e.target === e.target.getStage() || e.target.hasName("bg-canvas")) {
      onSelect(null);
    }
  };

  return (
    <div className="flex justify-center items-center p-4 bg-industrial-950/40 rounded-xl border border-industrial-800 shadow-inner overflow-hidden select-none">
      <Stage
        ref={stageRef}
        width={bounds.bleedWidth}
        height={bounds.bleedHeight}
        onMouseDown={checkDeselect}
        onTouchStart={checkDeselect}
        className="rounded shadow-elevation cursor-crosshair"
      >
        {/* Layer 1: Artwork & Canvas Elements */}
        <Layer>
          {/* Base Background Fill */}
          <Rect
            name="bg-canvas"
            x={0}
            y={0}
            width={bounds.bleedWidth}
            height={bounds.bleedHeight}
            fill={backgroundColor}
          />

          {/* User Canvas Elements */}
          {elements.map((el) => {
            const isSelected = el.id === selectedId;

            if (el.type === "text") {
              const textEl = el as TextCanvasElement;
              return (
                <Text
                  key={textEl.id}
                  id={textEl.id}
                  x={textEl.x}
                  y={textEl.y}
                  text={textEl.text}
                  fontSize={textEl.fontSize}
                  fontFamily={textEl.fontFamily || "Plus Jakarta Sans"}
                  fontStyle={`${textEl.isBold ? "bold" : ""} ${textEl.isItalic ? "italic" : ""}`.trim()}
                  fill={textEl.fill}
                  align={textEl.align}
                  rotation={textEl.rotation}
                  opacity={textEl.opacity}
                  draggable={!textEl.isLocked}
                  onClick={() => onSelect(textEl.id)}
                  onTap={() => onSelect(textEl.id)}
                  onDragEnd={(e) => {
                    handleElementUpdate(textEl.id, {
                      x: e.target.x(),
                      y: e.target.y(),
                    });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    handleElementUpdate(textEl.id, {
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                    });
                  }}
                />
              );
            }

            if (el.type === "image") {
              return (
                <KonvaURLImage
                  key={el.id}
                  element={el as ImageCanvasElement}
                  isSelected={isSelected}
                  onSelect={() => onSelect(el.id)}
                  onChange={(attrs) => handleElementUpdate(el.id, attrs)}
                />
              );
            }

            if (el.type === "rect") {
              const rectEl = el as ShapeCanvasElement;
              return (
                <Rect
                  key={rectEl.id}
                  id={rectEl.id}
                  x={rectEl.x}
                  y={rectEl.y}
                  width={rectEl.width}
                  height={rectEl.height}
                  fill={rectEl.fill}
                  stroke={rectEl.stroke}
                  strokeWidth={rectEl.strokeWidth || 0}
                  cornerRadius={rectEl.cornerRadius || 0}
                  rotation={rectEl.rotation}
                  opacity={rectEl.opacity}
                  draggable={!rectEl.isLocked}
                  onClick={() => onSelect(rectEl.id)}
                  onTap={() => onSelect(rectEl.id)}
                  onDragEnd={(e) => {
                    handleElementUpdate(rectEl.id, {
                      x: e.target.x(),
                      y: e.target.y(),
                    });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    handleElementUpdate(rectEl.id, {
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(5, node.width() * scaleX),
                      height: Math.max(5, node.height() * scaleY),
                      rotation: node.rotation(),
                    });
                  }}
                />
              );
            }

            return null;
          })}

          {/* Interactive Transformer */}
          <Transformer
            ref={trRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 10 || newBox.height < 10) {
                return oldBox;
              }
              return newBox;
            }}
            rotateEnabled={true}
            anchorSize={8}
            anchorCornerRadius={2}
            borderStroke="#FF5A1F"
            anchorStroke="#FF5A1F"
            anchorFill="#FFFFFF"
          />
        </Layer>

        {/* Layer 2: Visual Manufacturing Guides Overlay (§ 06) - Never part of design JSON or export */}
        <Layer name="guides-overlay-layer" listening={false} visible={showGuides}>
          {/* Guide 1: Bleed Zone Border (+3mm outer zone with guide marks) */}
          {showBleedGuide && (
            <Rect
              x={1}
              y={1}
              width={bounds.bleedWidth - 2}
              height={bounds.bleedHeight - 2}
              stroke="#EF4444"
              strokeWidth={1.5}
              dash={[4, 4]}
              opacity={0.7}
            />
          )}

          {/* Guide 2: Trim Line (Target Cut Contour) */}
          {showTrimGuide && (
            <Rect
              x={bounds.trimOffsetX}
              y={bounds.trimOffsetY}
              width={bounds.trimWidth}
              height={bounds.trimHeight}
              stroke="#090A0D"
              strokeWidth={1.5}
              opacity={0.8}
            />
          )}

          {/* Guide 3: Safety Zone (-3mm inner boundary preventing clipping) */}
          {showSafeGuide && (
            <Rect
              x={bounds.safeOffsetX}
              y={bounds.safeOffsetY}
              width={bounds.safeWidth}
              height={bounds.safeHeight}
              stroke="#10B981"
              strokeWidth={1}
              dash={[6, 3]}
              opacity={0.85}
            />
          )}

          {/* Corner Crop Marks (§ 07 standard) */}
          <Group opacity={0.6}>
            {/* Top Left */}
            <Line points={[bounds.trimOffsetX - 15, bounds.trimOffsetY, bounds.trimOffsetX, bounds.trimOffsetY]} stroke="#000" strokeWidth={1} />
            <Line points={[bounds.trimOffsetX, bounds.trimOffsetY - 15, bounds.trimOffsetX, bounds.trimOffsetY]} stroke="#000" strokeWidth={1} />
            {/* Top Right */}
            <Line points={[bounds.trimOffsetX + bounds.trimWidth, bounds.trimOffsetY, bounds.trimOffsetX + bounds.trimWidth + 15, bounds.trimOffsetY]} stroke="#000" strokeWidth={1} />
            <Line points={[bounds.trimOffsetX + bounds.trimWidth, bounds.trimOffsetY - 15, bounds.trimOffsetX + bounds.trimWidth, bounds.trimOffsetY]} stroke="#000" strokeWidth={1} />
            {/* Bottom Left */}
            <Line points={[bounds.trimOffsetX - 15, bounds.trimOffsetY + bounds.trimHeight, bounds.trimOffsetX, bounds.trimOffsetY + bounds.trimHeight]} stroke="#000" strokeWidth={1} />
            <Line points={[bounds.trimOffsetX, bounds.trimOffsetY + bounds.trimHeight, bounds.trimOffsetX, bounds.trimOffsetY + bounds.trimHeight + 15]} stroke="#000" strokeWidth={1} />
            {/* Bottom Right */}
            <Line points={[bounds.trimOffsetX + bounds.trimWidth, bounds.trimOffsetY + bounds.trimHeight, bounds.trimOffsetX + bounds.trimWidth + 15, bounds.trimOffsetY + bounds.trimHeight]} stroke="#000" strokeWidth={1} />
            <Line points={[bounds.trimOffsetX + bounds.trimWidth, bounds.trimOffsetY + bounds.trimHeight, bounds.trimOffsetX + bounds.trimWidth, bounds.trimOffsetY + bounds.trimHeight + 15]} stroke="#000" strokeWidth={1} />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
