import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";

import { RevealCard } from "./RevealCard";

describe("RevealCard", () => {
  beforeAll(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() => new Promise(() => undefined));
  });

  it("starts concealed and prevents a duplicate reveal", async () => {
    const reveal = jest.fn(() => new Promise<void>(() => undefined));
    const view = await render(<RevealCard revealed={false} label="Reveal Pick" onReveal={reveal} concealed={<Text>Hidden</Text>}><Text>Restaurant</Text></RevealCard>);
    expect(screen.getByText("Hidden")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Reveal Pick"));
    fireEvent.press(screen.getByLabelText("Reveal Pick"));
    expect(reveal).toHaveBeenCalledTimes(1);
    await view.rerender(<RevealCard revealed label="Reveal Pick" onReveal={reveal} concealed={<Text>Hidden</Text>}><Text>Restaurant</Text></RevealCard>);
    expect(screen.getByText("Restaurant")).toBeTruthy();
    expect(screen.queryByText("Hidden")).toBeNull();
  });
});
