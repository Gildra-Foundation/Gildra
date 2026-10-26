"use client";

import { useId, useMemo } from "react";
import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";
import { Floating, useSelect } from "@gildra/atlas-ui/valyroParts";
import { characterFrostArt, characterFrostMaterial } from "./characterFrostAssets";
import frost from "./characterFrost.module.css";

type ClassChoice = { id: number; name: string; icon: string | null };

function ClassEmblem({ icon }: { icon: string | null }) {
  return <span className={frost.pickerIcon} aria-hidden="true">
    <Image src={icon ?? characterFrostArt.heraldry} alt="" width={48} height={48} sizes="28px" />
  </span>;
}

/** The kit owns selection, keyboard/type-ahead and viewport-aware dismissal. */
export function CharacterClassPicker({ label, allLabel, choices, value, onChange, locale, className }: {
  label: string;
  allLabel: string;
  choices: ClassChoice[];
  value: number;
  onChange: (value: number) => void;
  locale: string;
  className: string;
}) {
  const labelId = useId();
  const items = useMemo(() => [
    { value: "0", label: allLabel, icon: null },
    ...choices.map(choice => ({ value: String(choice.id), label: choice.name, icon: choice.icon })),
  ], [allLabel, choices]);
  const select = useSelect({ items, value: String(value), onValueChange: next => onChange(Number(next)), locale, floating: false });
  const selected = items.find(item => item.value === String(value)) ?? items[0];

  return <div className={className}>
    <span id={labelId}>{label}</span>
    <div className={`${frost.control} ${frost.selectControl}`} data-frost-control="class">
      <button {...select.getTriggerProps({ className: frost.classTrigger, "aria-labelledby": labelId, "data-class-value": String(value) })}>
        <ClassEmblem icon={selected.icon} />
        <span className={frost.pickerValue} title={selected.label}>{selected.label}</span>
        <ChevronDown className={frost.classChevron} data-open={select.open || undefined} aria-hidden="true" />
      </button>
    </div>
    <Floating
      open={select.open}
      anchorRef={select.triggerRef}
      placement="bottom-end"
      offset={8}
      matchAnchorWidth
      surface={false}
      animation="none"
      onDismiss={reason => select.close(reason === "escape")}
      {...select.getPopupProps({ className: frost.classMenu, style: characterFrostMaterial, "data-frost-class-menu": "" })}
    >
      <div {...select.getListboxProps({ className: frost.classOptions, "aria-labelledby": labelId })}>
        {items.map((item, index) => <div key={item.value} {...select.getOptionProps(index, { className: frost.classOption, "data-class-id": item.value })}>
          <ClassEmblem icon={item.icon} />
          <span>{item.label}</span>
          <Check className={frost.classCheck} aria-hidden="true" />
        </div>)}
      </div>
    </Floating>
  </div>;
}
