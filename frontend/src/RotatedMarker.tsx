// @ts-nocheck
import "leaflet-rotatedmarker"
import React, { forwardRef, useEffect, useRef } from "react";
import { Marker } from "react-leaflet";

const RotatedMarker = forwardRef(({ children, ...props }, forwardRef) => {
    const markerRef = useRef();
  
    const { rotationAngle, rotationOrigin } = props;
    useEffect(() => {
      const marker = markerRef.current;
      if (marker) {
        marker.setRotationAngle(rotationAngle);
        marker.setRotationOrigin(rotationOrigin);
      }
    }, [rotationAngle, rotationOrigin]);
  
    return (
      <Marker
        ref={(ref) => {
          markerRef.current = ref;
          if (forwardRef) {
            forwardRef.current = ref;
          }
        }}
        {...props}
      >
        {children}
      </Marker>
    );
  });

export default RotatedMarker;