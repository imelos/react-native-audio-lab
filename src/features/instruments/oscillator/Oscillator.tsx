import Slider from '@react-native-community/slider';
import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { RadialSlider } from 'react-native-radial-slider';
import VerticalSlider from 'rn-vertical-slider';

export type VisualNote = {
  id: number;
  note: number;
  startTime: number;
  endTime?: number;
};

interface OsclillatorProps {
  channel: number;
}

const Oscillator: React.FC<OsclillatorProps> = ({ channel }) => {
  const filterRef = useRef({ cutoff: 1000, type: 'LowPass', resonanse: 200 });

  const setCutoff = (value: number) => {
    filterRef.current.cutoff = value;
  };
  return (
    <View style={{padding: 10}}>
     <VerticalSlider
        value={filterRef.current.cutoff}
        // onChange={(value) => setValue(value)}
        height={100}
        width={20}
        step={1}
        min={0}
        max={100}
        borderRadius={5}
        minimumTrackTintColor="#2979FF"
        maximumTrackTintColor="#D1D1D6"
        showIndicator
        // renderIndicator={() => (
        //   <View
        //     style={{
        //       height: 20,
        //       width : 25,
        //       backgroundColor: '#2979FF',
        //       justifyContent: 'center',
        //       alignSelf: 'center',
        //     }}
        //   >
        //     <Text style={{ color: '#fff' }}>value</Text>
        //   </View>
        // )}
        containerStyle={{ backgroundColor: '#e0e0e0', borderRadius: 10 }}
        sliderStyle={{ backgroundColor: '#fff', borderRadius: 5 }}
      />
      {/* <Slider
        vertical={true}
        value={filterRef.current.cutoff}
        minimumValue={0}
        maximumValue={200}
        onValueChange={setCutoff}
      />
      <RadialSlider min={20} max={200} variant={'radial-circle-slider'} /> */}
    </View>
  );
};

export default Oscillator;
