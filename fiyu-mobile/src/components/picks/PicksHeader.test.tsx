import { act, fireEvent, render } from "@testing-library/react-native";

import { PicksHeader } from "./PicksHeader";

jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: function MockIcon({ name }: { name: string }) { return <Text>{name}</Text>; } };
});

describe("PicksHeader", () => {
  it("restores the Fiyu/Tokyo identity and opens settings from the menu", async () => {
    const onOpenMenu = jest.fn();
    const view = await render(<PicksHeader onOpenMenu={onOpenMenu} />);
    expect(view.getByText("Fiyu")).toBeTruthy();
    expect(view.getByText("Tokyo")).toBeTruthy();
    expect(view.queryByText("location-outline")).toBeNull();
    expect(view.getByLabelText("Notifications unavailable in this preview").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(view.getByLabelText("Open settings"));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it("opens the edition selector and keeps future cities disabled", async () => {
    const view = await render(<PicksHeader onOpenMenu={jest.fn()} />);
    const trigger = view.getByLabelText("Choose Fiyu city edition. Current city: Tokyo");
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
    await act(async () => fireEvent.press(trigger));
    expect(view.getByText("Fiyu editions")).toBeTruthy();
    expect(view.getByLabelText("Tokyo, Japan, Available").props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(view.getByLabelText("New York, United States, Coming soon").props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText("Rome, Italy, Coming soon").props.accessibilityState.disabled).toBe(true);
    await act(async () => fireEvent.press(view.getByLabelText("Dismiss edition selector")));
    expect(view.queryByText("Fiyu editions")).toBeNull();
  });
});
