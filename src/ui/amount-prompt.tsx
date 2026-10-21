import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { parseAmount, toMajor } from '@/lib/money';
import { useApp } from '@/state/app';

import { Button, Field, Input, Row, Text } from './kit';

type Props = {
  visible: boolean;
  title: string;
  hint?: string;
  initial?: number;
  onSave: (minor: number) => void;
  onClose: () => void;
  onRemove?: () => void;
};

/** A small sheet that asks for one amount. `initial` and the saved value are in minor units. */
export function AmountPrompt(props: Props) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      {/* Mounting the body only while visible resets the input each time the sheet opens. */}
      {props.visible && <PromptBody {...props} />}
    </Modal>
  );
}

function PromptBody({ title, hint, initial, onSave, onClose, onRemove }: Props) {
  const { t, colors, isRTL } = useApp();
  const [value, setValue] = useState(initial ? String(toMajor(initial)) : '');
  const [error, setError] = useState<string>();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, direction: isRTL ? 'rtl' : 'ltr' }]}>
        <Text variant="heading">{title}</Text>
        <Field label={t('common.amount')} hint={hint} error={error}>
          <Input big autoFocus keyboardType="decimal-pad" value={value} onChangeText={setValue} placeholder="0" />
        </Field>
        <Row>
          {onRemove && <Button kind="ghost" title={t('common.clear')} onPress={onRemove} style={{ flex: 1 }} />}
          <Button kind="secondary" title={t('common.cancel')} onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={t('common.save')}
            style={{ flex: 1 }}
            onPress={() => {
              const minor = parseAmount(value);
              if (!minor) return setError(t('common.invalidAmount'));
              onSave(minor);
            }}
          />
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { padding: Spacing.four, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, gap: Spacing.two },
});
