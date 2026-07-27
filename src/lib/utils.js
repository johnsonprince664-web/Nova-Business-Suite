import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));

export const today = () => new Date().toISOString().slice(0, 10);

export const titleCase = (value = "") =>
  String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
