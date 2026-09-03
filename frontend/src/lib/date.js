import { parseISO } from "date-fns";

export const parseDateOnly = (value) => {
  if (!value) return null;
  return parseISO(value);
};

export const compareEventDateTime = (left, right) => {
  const leftDate = left.date || "";
  const rightDate = right.date || "";

  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  return (left.time || "").localeCompare(right.time || "");
};
