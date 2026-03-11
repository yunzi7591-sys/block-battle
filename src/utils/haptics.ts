import * as Haptics from 'expo-haptics';

export function hapticLight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticMedium() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticHeavy() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export function hapticError() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
