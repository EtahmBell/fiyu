// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StarRatingInput } from "@/components/log/StarRatingInput";

afterEach(cleanup);

describe("StarRatingInput", () => {
  it("exposes an accessible required radio group and commits click/tap changes", () => {
    const onChange = vi.fn();
    const { rerender } = render(<StarRatingInput value={null} onChange={onChange} />);

    expect(screen.getByRole("radiogroup", { name: "How was it?" }).getAttribute("aria-required")).toBe("true");
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "3 out of 5 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    rerender(<StarRatingInput value={3} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "3 out of 5 stars" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.pointerDown(screen.getByRole("radio", { name: "5 out of 5 stars" }));
    fireEvent.click(screen.getByRole("radio", { name: "5 out of 5 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it("supports arrow, Home, and End keyboard selection", () => {
    const onChange = vi.fn();
    render(<StarRatingInput value={3} onChange={onChange} />);
    const selected = screen.getByRole("radio", { name: "3 out of 5 stars" });

    fireEvent.keyDown(selected, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(selected, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(selected, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(selected, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(5);
  });
});
