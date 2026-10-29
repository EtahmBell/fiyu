import { fireEvent, render } from "@testing-library/react-native";

import { PicksHeader } from "./PicksHeader";

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text } = jest.requireActual("react-native");
  return function MockIcon({ name }: { name: string }) { return <Text>{name}</Text>; };
});

describe("PicksHeader", () => {
  it("restores the Fiyu/Tokyo identity and opens settings from the menu", async () => {
    const onOpenMenu = jest.fn();
    const view = await render(<PicksHeader onOpenMenu={onOpenMenu} />);
    expect(view.getByText("Fiyu")).toBeTruthy();
    expect(view.getByText("TOKYO")).toBeTruthy();
    expect(view.getByLabelText("Notifications unavailable in this preview").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(view.getByLabelText("Open settings"));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });
});
