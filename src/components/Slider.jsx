import React, { memo, useCallback, useId } from 'react';

function SliderComponent({ label, value, setValue, min = 0, max = 100 }) {
  const id = useId();
  const onChange = useCallback((event) => {
    setValue(Number(event.target.value));
  }, [setValue]);

  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} value={value} onChange={onChange} />
      <output htmlFor={id}>{value}</output>
    </div>
  );
}

export const Slider = memo(SliderComponent);
