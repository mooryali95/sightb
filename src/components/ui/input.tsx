import * as React from "react";

import { cn } from "@/lib/utils";
import { useAutoLabel } from "@/lib/a11y/auto-label";

const base =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const labelled = useAutoLabel(ref);
    if (type === "date") return <DateInput className={className} forwardedRef={labelled} {...props} />;
    return <input type={type} className={cn(base, className)} ref={labelled} {...props} />;
  },
);
Input.displayName = "Input";

// Width classes belong to the box that holds the field and its Arabic reading.
const WIDTH = /^(?:[a-z0-9]+:)*(?:w-|min-w-|max-w-|flex-|basis-|shrink|grow|col-span|self-)/;

const arabicDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });

/** «2026-11-04» reads «4 نوفمبر 2026»; anything unparsable reads as written. */
function formatDateAr(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : arabicDate.format(d);
}

/**
 * The browser draws a date field in its own locale, so an Arabic screen showed
 * «mm/dd/yyyy». The native field stays (its picker, keyboard entry and form
 * value are unchanged); at rest its text is hidden and the date is read in
 * Arabic over it. While focused, the native text shows for typing.
 */
function DateInput({
  className,
  forwardedRef,
  onChange,
  ...props
}: React.ComponentProps<"input"> & { forwardedRef: React.RefCallback<HTMLInputElement> }) {
  const node = React.useRef<HTMLInputElement | null>(null);
  const [shown, setShown] = React.useState(String(props.value ?? props.defaultValue ?? ""));
  const ref = React.useCallback(
    (el: HTMLInputElement | null) => {
      node.current = el;
      forwardedRef(el);
    },
    [forwardedRef],
  );
  // A value set from code fires no change event: follow the prop, and re-read after a form reset.
  React.useLayoutEffect(() => {
    const el = node.current;
    if (el && el.value !== shown) setShown(el.value);
  }, [props.value, shown]);
  React.useEffect(() => {
    const form = node.current?.form;
    if (!form) return;
    const reread = () => setTimeout(() => setShown(node.current?.value ?? ""), 0);
    form.addEventListener("reset", reread);
    return () => form.removeEventListener("reset", reread);
  }, []);

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => WIDTH.test(c)).join(" ");
  const inner = classes.filter((c) => !WIDTH.test(c)).join(" ");

  return (
    <div className={cn("relative w-full", outer)}>
      <input
        type="date"
        className={cn(base, "date-native peer", inner)}
        ref={ref}
        onChange={(e) => {
          setShown(e.currentTarget.value);
          onChange?.(e);
        }}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 start-3 end-10 flex items-center truncate text-base md:text-sm peer-focus:invisible peer-disabled:opacity-50",
          shown ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {shown ? formatDateAr(shown) : "اختر التاريخ"}
      </span>
    </div>
  );
}

export { Input };
