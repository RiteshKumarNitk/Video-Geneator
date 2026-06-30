import torch

def download():
    print("Pre-downloading Robust Video Matting (MobileNetV3) from PyTorch Hub...")
    try:
        # This will trigger the download and cache the model/weights locally
        model = torch.hub.load('PeterL1n/RobustVideoMatting', 'mobilenetv3', pretrained=True)
        print("Model downloaded and cached successfully!")
    except Exception as e:
        print(f"Error downloading model: {e}")
        exit(1)

if __name__ == "__main__":
    download()
