"use client";
import { createContext, useContext } from "react";

export const ReadVisibility = createContext(true);
export const useReadVisibility = () => useContext(ReadVisibility);
