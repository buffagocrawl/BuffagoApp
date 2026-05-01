import { useState } from 'react';
import { View } from 'react-native';
import { Text, Button, TextInput } from 'react-native-paper';

export default function RatingSheet({ onSubmit, onCancel, destName }) {
  const [crispiness, setCrisp] = useState('7');
  const [sauce, setSauce] = useState('7');
  const [meat, setMeat] = useState('7');
  const [overall, setOverall] = useState('8');

  return (
    <View style={{ padding:16, gap:8 }}>
      <Text variant="titleMedium" style={{ fontWeight:'700' }}>Rate {destName}</Text>
      <TextInput mode="outlined" label="Crispiness (1-10)" keyboardType="numeric" value={crispiness} onChangeText={setCrisp} />
      <TextInput mode="outlined" label="Sauce (1-10)"       keyboardType="numeric" value={sauce} onChangeText={setSauce} />
      <TextInput mode="outlined" label="Chicken Quality (1-10)"        keyboardType="numeric" value={meat} onChangeText={setMeat} />
      <TextInput mode="outlined" label="Experience (1-10)"     keyboardType="numeric" value={overall} onChangeText={setOverall} />
      <Button mode="contained" onPress={() => onSubmit({
        crispiness: Number(crispiness), sauce: Number(sauce), meat: Number(meat), overall: Number(overall)
      })}>Submit</Button>
      <Button mode="text" onPress={onCancel}>Cancel</Button>
    </View>
  );
}
