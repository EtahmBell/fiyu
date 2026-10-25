import { fireEvent, render, screen } from "@testing-library/react-native";

import { PersonalizedPickModal } from "./PersonalizedPickModal";

describe("PersonalizedPickModal", () => {
  it("offers exactly three identity-safe hidden choices and no reroll", async () => {
    const choose = jest.fn();
    await render(<PersonalizedPickModal visible pending={false} error={null} onChoose={choose} onDismiss={jest.fn()} />);
    expect(screen.getAllByText("Choose")).toHaveLength(3);
    expect(screen.queryByText("Restaurant secret name")).toBeNull();
    expect(screen.queryByText(/reroll/i)).toBeNull();
    fireEvent.press(screen.getByLabelText("Choose hidden Personalized Pick 2"));
    expect(choose).toHaveBeenCalledWith(1);
  });

  it("supports the canonical 24-hour dismissal action", async () => {
    const dismiss = jest.fn();
    await render(<PersonalizedPickModal visible pending={false} error={null} onChoose={jest.fn()} onDismiss={dismiss} />);
    fireEvent.press(screen.getByText("Not now"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
