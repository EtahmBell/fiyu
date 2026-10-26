import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

import { copyTogetherInvite, shareTogetherInvite } from "./nativeShare";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => undefined) }));

describe("Together native sharing", () => {
  it("shares only concise copy and the canonical invitation URL", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const url = "https://fiyu.app/together/public-token";
    await expect(shareTogetherInvite(url)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Fiyu Together", message: `Find three Fiyu Picks with me.\n${url}`, url });
  });

  it("copies the canonical URL through Expo Clipboard", async () => {
    const url = "https://fiyu.app/together/public-token";
    await copyTogetherInvite(url);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(url);
  });
});
