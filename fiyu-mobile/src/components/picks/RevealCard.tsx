import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet } from "react-native";

interface RevealCardProps {
  revealed: boolean;
  busy?: boolean;
  label: string;
  onReveal(): Promise<unknown> | void;
  concealed: ReactNode;
  children: ReactNode;
}

export function RevealCard({ revealed, busy = false, label, onReveal, concealed, children }: RevealCardProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [press] = useState(() => new Animated.Value(1));
  const [shine] = useState(() => new Animated.Value(0));
  const [face] = useState(() => new Animated.Value(revealed ? 1 : 0));
  const priorRevealed = useRef(revealed);
  const revealLocked = useRef(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (revealed && !priorRevealed.current) {
      Animated.timing(face, { toValue: 1, duration: reduceMotion ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setTransitioning(false));
    }
    priorRevealed.current = revealed;
  }, [face, reduceMotion, revealed]);

  const reveal = async () => {
    if (revealed || busy || transitioning || revealLocked.current) return;
    revealLocked.current = true;
    setTransitioning(true);
    if (!reduceMotion) Animated.timing(shine, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    try {
      await onReveal();
    } catch {
      revealLocked.current = false;
      setTransitioning(false);
      shine.setValue(0);
    }
  };

  if (revealed) {
    return <Animated.View style={{ opacity: face, transform: [{ scale: face.interpolate({ inputRange: [0, 1], outputRange: [0.992, 1] }) }] }}>{children}</Animated.View>;
  }

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy || transitioning}
        onPressIn={() => !reduceMotion && Animated.spring(press, { toValue: 0.988, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true }).start()}
        onPress={() => void reveal()}
      >
        {concealed}
        <Animated.View pointerEvents="none" style={[styles.shine, { opacity: shine.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.2, 0] }), transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-260, 420] }) }, { rotate: "-18deg" }] }]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shine: { position: "absolute", top: -40, bottom: -40, width: 70, backgroundColor: "#FFFFFF" },
});
