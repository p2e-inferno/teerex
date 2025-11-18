/**
 * Image cropping utilities for react-easy-crop
 * Based on official react-easy-crop examples
 */

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Creates an image element from a URL
 * @param url - Image URL (can be blob URL or remote URL)
 * @returns Promise that resolves with HTMLImageElement
 */
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error);
  });

/**
 * Extracts the cropped area from an image using canvas
 * @param imageSrc - Source image URL (blob or remote)
 * @param croppedPixels - Pixel coordinates from react-easy-crop
 * @param rotation - Rotation in degrees (default 0)
 * @param fileName - Optional filename for the resulting blob
 * @returns Promise that resolves with a File object of the cropped image
 */
export const getCroppedImg = async (
  imageSrc: string,
  croppedPixels: Area,
  rotation: number = 0,
  fileName: string = 'cropped-image.jpg'
): Promise<File | null> => {
  try {
    const image: HTMLImageElement = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const radians = (rotation * Math.PI) / 180;

    // Calculate the bounding box after rotation
    const rotatedWidth =
      Math.abs(Math.cos(radians) * image.width) +
      Math.abs(Math.sin(radians) * image.height);
    const rotatedHeight =
      Math.abs(Math.sin(radians) * image.width) +
      Math.abs(Math.cos(radians) * image.height);

    // Set canvas size to accommodate rotated image
    canvas.width = rotatedWidth;
    canvas.height = rotatedHeight;

    // Move the origin to the center of the canvas for rotation specific transformations
    ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
    ctx.rotate(radians);

    // Draw the image so it is centered in the canvas
    ctx.drawImage(image, -image.width / 2, -image.height / 2);

    // Reset the transformation before final cropping
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Create another canvas for the final cropped image
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx: CanvasRenderingContext2D | null = croppedCanvas.getContext('2d');

    if (!croppedCtx) {
      throw new Error('Failed to get cropped canvas context');
    }

    croppedCanvas.width = croppedPixels.width;
    croppedCanvas.height = croppedPixels.height;

    // Draw the final cropped area from the rotated image
    croppedCtx.drawImage(
      canvas,
      croppedPixels.x,
      croppedPixels.y,
      croppedPixels.width,
      croppedPixels.height,
      0,
      0,
      croppedPixels.width,
      croppedPixels.height
    );

    return new Promise((resolve, reject) => {
      croppedCanvas.toBlob((blob) => {
        if (!blob) {
          console.error('Blob creation failed');
          reject(new Error('Failed to create blob from canvas'));
          return;
        }

        // Convert blob to File object
        const file = new File([blob], fileName, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        resolve(file);
      }, 'image/jpeg', 0.95); // 0.95 quality for good balance between size and quality
    });
  } catch (error) {
    console.error('Error cropping image:', error);
    return null;
  }
};

/**
 * Creates a blob URL from a File object for preview purposes
 * @param file - File object
 * @returns Blob URL string
 */
export const createBlobUrl = (file: File): string => {
  return URL.createObjectURL(file);
};

/**
 * Revokes a blob URL to free up memory
 * @param blobUrl - The blob URL to revoke
 */
export const revokeBlobUrl = (blobUrl: string): void => {
  URL.revokeObjectURL(blobUrl);
};
